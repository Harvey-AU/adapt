package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Harvey-AU/adapt/internal/auth"
	"github.com/rs/zerolog/log"
)

type billingCheckoutRequest struct {
	PlanID string `json:"plan_id"`
}

var paddleHTTPClient = &http.Client{Timeout: 30 * time.Second}

type paddleCheckoutItem struct {
	PriceID  string `json:"price_id"`
	Quantity int    `json:"quantity"`
}

type paddleCheckoutCustomData struct {
	OrganisationID string `json:"organisation_id"`
	RequestedBy    string `json:"requested_by"`
	PlanID         string `json:"plan_id"`
}

type paddleCheckoutPayload struct {
	Items      []paddleCheckoutItem     `json:"items"`
	CustomData paddleCheckoutCustomData `json:"custom_data"`
}

type paddlePortalSessionPayload struct {
	ReturnURL string `json:"return_url"`
}

type paddleAPIError struct {
	Detail  string `json:"detail"`
	Message string `json:"message"`
}

type paddleAPIEnvelope struct {
	Data  json.RawMessage `json:"data"`
	Error paddleAPIError  `json:"error"`
}

type paddleCheckoutResponse struct {
	Checkout struct {
		URL string `json:"url"`
	} `json:"checkout"`
	CheckoutURL string `json:"checkout_url"`
}

type paddlePortalURLs struct {
	General struct {
		Overview string `json:"overview"`
	} `json:"general"`
}

type paddlePortalResponse struct {
	URL  string           `json:"url"`
	URLs paddlePortalURLs `json:"urls"`
}

type paddleWebhookEvent struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	Data      json.RawMessage `json:"data"`
	Meta      json.RawMessage `json:"meta"`
}

type paddleWebhookOrgLookup struct {
	CustomData struct {
		OrganisationID string `json:"organisation_id"`
	} `json:"custom_data"`
	CustomerID     string `json:"customer_id"`
	ID             string `json:"id"`
	SubscriptionID string `json:"subscription_id"`
}

type paddleSubscriptionItem struct {
	Price struct {
		ID string `json:"id"`
	} `json:"price"`
	PriceID string `json:"price_id"`
}

type paddleSubscriptionData struct {
	ID                   string `json:"id"`
	SubscriptionID       string `json:"subscription_id"`
	CustomerID           string `json:"customer_id"`
	Status               string `json:"status"`
	NextBilledAt         string `json:"next_billed_at"`
	CurrentBillingPeriod struct {
		EndsAt string `json:"ends_at"`
	} `json:"current_billing_period"`
	Items []paddleSubscriptionItem `json:"items"`
}

type paddleTransactionTotals struct {
	GrandTotal   string `json:"grand_total"`
	Total        string `json:"total"`
	CurrencyCode string `json:"currency_code"`
}

type paddleTransactionDetails struct {
	InvoiceNumber string                  `json:"invoice_number"`
	Totals        paddleTransactionTotals `json:"totals"`
	ReceiptURL    string                  `json:"receipt_url"`
}

type paddleTransactionData struct {
	ID             string                   `json:"id"`
	SubscriptionID string                   `json:"subscription_id"`
	CustomerID     string                   `json:"customer_id"`
	Status         string                   `json:"status"`
	InvoiceID      string                   `json:"invoice_id"`
	CurrencyCode   string                   `json:"currency_code"`
	BilledAt       string                   `json:"billed_at"`
	UpdatedAt      string                   `json:"updated_at"`
	CreatedAt      string                   `json:"created_at"`
	InvoiceURL     string                   `json:"invoice_url"`
	Details        paddleTransactionDetails `json:"details"`
}

// BillingHandler handles GET /v1/billing.
func (h *Handler) BillingHandler(w http.ResponseWriter, r *http.Request) {
	logger := loggerWithRequest(r)

	if r.Method != http.MethodGet {
		MethodNotAllowed(w, r)
		return
	}

	orgID := h.GetActiveOrganisation(w, r)
	if orgID == "" {
		return
	}

	row := h.DB.GetDB().QueryRowContext(r.Context(), `
		SELECT
			o.plan_id,
			p.display_name,
			p.monthly_price_cents,
			o.subscription_status,
			o.paddle_customer_id,
			o.paddle_subscription_id,
			o.current_period_ends_at
		FROM organisations o
		JOIN plans p ON p.id = o.plan_id
		WHERE o.id = $1
	`, orgID)

	var (
		planID             string
		planDisplayName    string
		monthlyPriceCents  int
		subscriptionStatus string
		paddleCustomerID   sql.NullString
		paddleSubID        sql.NullString
		currentPeriodEnds  sql.NullTime
	)
	if err := row.Scan(
		&planID,
		&planDisplayName,
		&monthlyPriceCents,
		&subscriptionStatus,
		&paddleCustomerID,
		&paddleSubID,
		&currentPeriodEnds,
	); err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to load billing overview")
		InternalError(w, r, fmt.Errorf("failed to load billing overview: %w", err))
		return
	}

	billingEnabled := strings.TrimSpace(os.Getenv("PADDLE_API_KEY")) != ""

	response := map[string]any{
		"plan_id":              planID,
		"plan_display_name":    planDisplayName,
		"monthly_price_cents":  monthlyPriceCents,
		"subscription_status":  subscriptionStatus,
		"billing_enabled":      billingEnabled,
		"has_customer_account": paddleCustomerID.Valid && paddleCustomerID.String != "",
	}
	if paddleSubID.Valid {
		response["subscription_id"] = paddleSubID.String
	}
	if currentPeriodEnds.Valid {
		response["current_period_ends_at"] = currentPeriodEnds.Time.UTC().Format(time.RFC3339)
	}

	WriteSuccess(w, r, map[string]any{"billing": response}, "Billing overview retrieved successfully")
}

// BillingInvoicesHandler handles GET /v1/billing/invoices.
func (h *Handler) BillingInvoicesHandler(w http.ResponseWriter, r *http.Request) {
	logger := loggerWithRequest(r)

	if r.Method != http.MethodGet {
		MethodNotAllowed(w, r)
		return
	}

	orgID := h.GetActiveOrganisation(w, r)
	if orgID == "" {
		return
	}

	rows, err := h.DB.GetDB().QueryContext(r.Context(), `
		SELECT invoice_number, status, currency_code, total_amount_cents, billed_at, invoice_url
		FROM billing_invoices
		WHERE organisation_id = $1
		ORDER BY billed_at DESC NULLS LAST, created_at DESC
		LIMIT 50
	`, orgID)
	if err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to query billing invoices")
		InternalError(w, r, fmt.Errorf("failed to list billing invoices: %w", err))
		return
	}
	defer rows.Close()

	invoices := make([]map[string]any, 0)
	for rows.Next() {
		var (
			number   sql.NullString
			status   string
			currency sql.NullString
			total    int
			billedAt sql.NullTime
			url      sql.NullString
		)
		if err := rows.Scan(&number, &status, &currency, &total, &billedAt, &url); err != nil {
			logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to scan billing invoice row")
			InternalError(w, r, fmt.Errorf("failed to scan invoice row: %w", err))
			return
		}
		entry := map[string]any{
			"status":              status,
			"currency_code":       strings.ToUpper(strings.TrimSpace(currency.String)),
			"total_amount_cents":  total,
			"invoice_number":      number.String,
			"invoice_url":         url.String,
			"invoice_available":   url.Valid && strings.TrimSpace(url.String) != "",
			"billed_at_timestamp": nil,
		}
		if billedAt.Valid {
			entry["billed_at"] = billedAt.Time.UTC().Format("2006-01-02")
			entry["billed_at_timestamp"] = billedAt.Time.UTC().Format(time.RFC3339)
		}
		invoices = append(invoices, entry)
	}

	if err := rows.Err(); err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed iterating billing invoices")
		InternalError(w, r, fmt.Errorf("failed to iterate invoice rows: %w", err))
		return
	}

	WriteSuccess(w, r, map[string]any{"invoices": invoices}, "Invoices retrieved successfully")
}

// BillingCheckoutHandler handles POST /v1/billing/checkout.
func (h *Handler) BillingCheckoutHandler(w http.ResponseWriter, r *http.Request) {
	logger := loggerWithRequest(r)

	if r.Method != http.MethodPost {
		MethodNotAllowed(w, r)
		return
	}

	userClaims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		Unauthorised(w, r, "User information not found")
		return
	}

	orgID := h.GetActiveOrganisation(w, r)
	if orgID == "" {
		return
	}
	if ok := h.requireOrganisationAdmin(w, r, orgID, userClaims.UserID); !ok {
		return
	}

	var req billingCheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, r, "Invalid JSON request body")
		return
	}
	req.PlanID = strings.TrimSpace(req.PlanID)
	if req.PlanID == "" {
		BadRequest(w, r, "plan_id is required")
		return
	}

	var (
		planName          string
		planDisplayName   string
		monthlyPriceCents int
		paddlePriceID     sql.NullString
	)
	err := h.DB.GetDB().QueryRowContext(r.Context(), `
		SELECT name, display_name, monthly_price_cents, paddle_price_id
		FROM plans
		WHERE id = $1 AND is_active = true
	`, req.PlanID).Scan(&planName, &planDisplayName, &monthlyPriceCents, &paddlePriceID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			BadRequest(w, r, "Plan not found")
			return
		}
		logger.Error().
			Err(err).
			Str("organisation_id", orgID).
			Str("plan_id", req.PlanID).
			Msg("Failed to load checkout plan")
		InternalError(w, r, fmt.Errorf("failed to load plan: %w", err))
		return
	}

	// Free tier changes are applied immediately without checkout.
	if monthlyPriceCents == 0 {
		if err := h.DB.SetOrganisationPlan(r.Context(), orgID, req.PlanID); err != nil {
			logger.Error().
				Err(err).
				Str("organisation_id", orgID).
				Str("plan_id", req.PlanID).
				Msg("Failed to update organisation plan")
			InternalError(w, r, fmt.Errorf("failed to update organisation plan: %w", err))
			return
		}
		WriteSuccess(w, r, map[string]any{
			"plan_updated": true,
			"plan_name":    planDisplayName,
		}, "Plan updated successfully")
		return
	}

	if strings.TrimSpace(os.Getenv("PADDLE_API_KEY")) == "" {
		ServiceUnavailable(w, r, "Billing is not configured")
		return
	}
	if !paddlePriceID.Valid || strings.TrimSpace(paddlePriceID.String) == "" {
		BadRequest(w, r, fmt.Sprintf("Plan %q is not configured for checkout", planName))
		return
	}

	payload := paddleCheckoutPayload{
		Items: []paddleCheckoutItem{
			{
				PriceID:  paddlePriceID.String,
				Quantity: 1,
			},
		},
		CustomData: paddleCheckoutCustomData{
			OrganisationID: orgID,
			RequestedBy:    userClaims.UserID,
			PlanID:         req.PlanID,
		},
	}

	data, err := h.callPaddleAPI(r.Context(), http.MethodPost, "/transactions", payload)
	if err != nil {
		logger.Error().
			Err(err).
			Str("organisation_id", orgID).
			Str("plan_id", req.PlanID).
			Msg("Failed to create Paddle checkout transaction")
		InternalError(w, r, fmt.Errorf("failed to create checkout transaction: %w", err))
		return
	}
	var checkout paddleCheckoutResponse
	if err := json.Unmarshal(data, &checkout); err != nil {
		logger.Error().
			Err(err).
			Str("organisation_id", orgID).
			Str("plan_id", req.PlanID).
			Msg("Failed to decode Paddle checkout response")
		InternalError(w, r, fmt.Errorf("failed to decode checkout response: %w", err))
		return
	}

	checkoutURL := checkout.Checkout.URL
	if checkoutURL == "" {
		// Fallback for alternate API payloads.
		checkoutURL = checkout.CheckoutURL
	}
	if checkoutURL == "" {
		InternalError(w, r, fmt.Errorf("paddle response missing checkout URL"))
		return
	}

	WriteSuccess(w, r, map[string]any{
		"checkout_url": checkoutURL,
		"plan_name":    planDisplayName,
	}, "Checkout session created")
}

// BillingPortalHandler handles POST /v1/billing/portal.
func (h *Handler) BillingPortalHandler(w http.ResponseWriter, r *http.Request) {
	logger := loggerWithRequest(r)

	if r.Method != http.MethodPost {
		MethodNotAllowed(w, r)
		return
	}

	userClaims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		Unauthorised(w, r, "User information not found")
		return
	}

	orgID := h.GetActiveOrganisation(w, r)
	if orgID == "" {
		return
	}
	if ok := h.requireOrganisationAdmin(w, r, orgID, userClaims.UserID); !ok {
		return
	}

	var customerID sql.NullString
	if err := h.DB.GetDB().QueryRowContext(r.Context(), `
		SELECT paddle_customer_id
		FROM organisations
		WHERE id = $1
	`, orgID).Scan(&customerID); err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to load billing customer")
		InternalError(w, r, fmt.Errorf("failed to load billing customer: %w", err))
		return
	}
	if !customerID.Valid || strings.TrimSpace(customerID.String) == "" {
		BadRequest(w, r, "No active billing customer found for this organisation")
		return
	}

	payload := paddlePortalSessionPayload{
		ReturnURL: getAppURL() + "/settings/billing",
	}
	data, err := h.callPaddleAPI(
		r.Context(),
		http.MethodPost,
		fmt.Sprintf("/customers/%s/portal-sessions", customerID.String),
		payload,
	)
	if err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to create Paddle billing portal session")
		InternalError(w, r, fmt.Errorf("failed to create billing portal session: %w", err))
		return
	}
	var portal paddlePortalResponse
	if err := json.Unmarshal(data, &portal); err != nil {
		logger.Error().Err(err).Str("organisation_id", orgID).Msg("Failed to decode Paddle billing portal response")
		InternalError(w, r, fmt.Errorf("failed to decode billing portal response: %w", err))
		return
	}

	portalURL := portal.URL
	if portalURL == "" {
		portalURL = portal.URLs.General.Overview
	}
	if portalURL == "" {
		InternalError(w, r, fmt.Errorf("paddle response missing portal URL"))
		return
	}

	WriteSuccess(w, r, map[string]any{
		"portal_url": portalURL,
	}, "Billing portal session created")
}

// PaddleWebhook handles POST /v1/webhooks/paddle.
func (h *Handler) PaddleWebhook(w http.ResponseWriter, r *http.Request) {
	logger := loggerWithRequest(r)
	startedAt := time.Now()

	if r.Method != http.MethodPost {
		MethodNotAllowed(w, r)
		return
	}

	webhookSecret := strings.TrimSpace(os.Getenv("PADDLE_WEBHOOK_SECRET"))
	if webhookSecret == "" {
		ServiceUnavailable(w, r, "Paddle webhook secret is not configured")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		BadRequest(w, r, "Failed to read webhook payload")
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	if !verifyPaddleSignature(r.Header.Get("Paddle-Signature"), body, webhookSecret) {
		logger.Warn().
			Bool("signature_present", r.Header.Get("Paddle-Signature") != "").
			Msg("Paddle webhook signature verification failed")
		Unauthorised(w, r, "Invalid webhook signature")
		return
	}

	var event paddleWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		BadRequest(w, r, "Invalid webhook payload")
		return
	}
	if strings.TrimSpace(event.EventID) == "" || strings.TrimSpace(event.EventType) == "" {
		BadRequest(w, r, "Webhook payload missing event metadata")
		return
	}
	logger.Info().
		Str("event_id", event.EventID).
		Str("event_type", event.EventType).
		Msg("Paddle webhook received")

	insertRes, err := h.DB.GetDB().ExecContext(r.Context(), `
		INSERT INTO paddle_webhook_events (event_id, event_type, status, received_at)
		VALUES ($1, $2, 'processing', NOW())
		ON CONFLICT (event_id) DO NOTHING
	`, event.EventID, event.EventType)
	if err != nil {
		InternalError(w, r, fmt.Errorf("failed to track webhook event: %w", err))
		return
	}
	if rows, _ := insertRes.RowsAffected(); rows == 0 {
		logger.Debug().
			Str("event_id", event.EventID).
			Str("event_type", event.EventType).
			Msg("Paddle webhook already processed")
		WriteSuccess(w, r, nil, "Webhook already processed")
		return
	}

	processErr := h.processPaddleWebhookEvent(r.Context(), event.EventType, event.Data)
	status := "processed"
	errMsg := ""
	if processErr != nil {
		status = "failed"
		errMsg = processErr.Error()
	}

	_, _ = h.DB.GetDB().ExecContext(r.Context(), `
		UPDATE paddle_webhook_events
		SET status = $2, processed_at = NOW(), error_message = NULLIF($3, '')
		WHERE event_id = $1
	`, event.EventID, status, errMsg)

	if processErr != nil {
		logger.Error().
			Err(processErr).
			Str("event_id", event.EventID).
			Str("event_type", event.EventType).
			Dur("duration", time.Since(startedAt)).
			Msg("Paddle webhook processing failed")
		InternalError(w, r, processErr)
		return
	}
	logger.Info().
		Str("event_id", event.EventID).
		Str("event_type", event.EventType).
		Dur("duration", time.Since(startedAt)).
		Msg("Paddle webhook processed successfully")

	WriteSuccess(w, r, nil, "Webhook processed successfully")
}

func (h *Handler) processPaddleWebhookEvent(ctx context.Context, eventType string, data json.RawMessage) error {
	if len(data) == 0 {
		return nil
	}

	var lookup paddleWebhookOrgLookup
	if err := json.Unmarshal(data, &lookup); err != nil {
		return fmt.Errorf("failed to decode webhook event data: %w", err)
	}

	orgID := lookup.CustomData.OrganisationID
	customerID := lookup.CustomerID
	subscriptionID := lookup.ID
	if strings.HasPrefix(eventType, "transaction.") {
		subscriptionID = lookup.SubscriptionID
	}
	if orgID == "" && subscriptionID != "" {
		if err := h.DB.GetDB().QueryRowContext(ctx, `
			SELECT id
			FROM organisations
			WHERE paddle_subscription_id = $1
			LIMIT 1
		`, subscriptionID).Scan(&orgID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Debug().
				Err(err).
				Str("subscription_id", subscriptionID).
				Msg("Failed fallback lookup by paddle subscription ID")
		}
	}
	if orgID == "" && customerID != "" {
		if err := h.DB.GetDB().QueryRowContext(ctx, `
			SELECT id
			FROM organisations
			WHERE paddle_customer_id = $1
			LIMIT 1
		`, customerID).Scan(&orgID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Debug().
				Err(err).
				Str("customer_id", customerID).
				Msg("Failed fallback lookup by paddle customer ID")
		}
	}
	if orgID == "" {
		return nil
	}

	if strings.HasPrefix(eventType, "subscription.") {
		var sub paddleSubscriptionData
		if err := json.Unmarshal(data, &sub); err != nil {
			return fmt.Errorf("failed to decode subscription webhook data: %w", err)
		}
		priceID := ""
		if len(sub.Items) > 0 {
			priceID = firstNonEmpty(sub.Items[0].Price.ID, sub.Items[0].PriceID)
		}
		if subscriptionID == "" {
			subscriptionID = sub.SubscriptionID
		}
		status := strings.ToLower(sub.Status)
		if status == "" {
			status = "active"
		}
		status = normaliseSubscriptionStatus(status)
		periodEnd := parseAnyTimestamp(
			sub.NextBilledAt,
			sub.CurrentBillingPeriod.EndsAt,
		)

		_, err := h.DB.GetDB().ExecContext(ctx, `
			UPDATE organisations o
			SET
				paddle_customer_id = COALESCE(NULLIF($2, ''), o.paddle_customer_id),
				paddle_subscription_id = COALESCE(NULLIF($3, ''), o.paddle_subscription_id),
				subscription_status = COALESCE(NULLIF($4, ''), o.subscription_status),
				current_period_ends_at = COALESCE($5, o.current_period_ends_at),
				plan_id = COALESCE((SELECT id FROM plans WHERE paddle_price_id = NULLIF($6, '') LIMIT 1), o.plan_id),
				paddle_updated_at = NOW(),
				updated_at = NOW()
			WHERE o.id = $1
		`, orgID, customerID, subscriptionID, status, periodEnd, priceID)
		return err
	}

	if strings.HasPrefix(eventType, "transaction.") {
		var txData paddleTransactionData
		if err := json.Unmarshal(data, &txData); err != nil {
			return fmt.Errorf("failed to decode transaction webhook data: %w", err)
		}
		txID := txData.ID
		if txID == "" {
			return nil
		}

		status := strings.ToLower(txData.Status)
		if status == "" {
			status = "paid"
		}
		status = normaliseInvoiceStatus(status)
		invoiceID := txData.InvoiceID
		invoiceNumber := txData.Details.InvoiceNumber
		currency := firstNonEmpty(txData.CurrencyCode, txData.Details.Totals.CurrencyCode)
		totalCents := parseAnyInt(
			txData.Details.Totals.GrandTotal,
			txData.Details.Totals.Total,
		)
		billedAt := parseAnyTimestamp(
			txData.BilledAt,
			txData.UpdatedAt,
			txData.CreatedAt,
		)
		invoiceURL := txData.InvoiceURL
		if invoiceURL == "" {
			invoiceURL = txData.Details.ReceiptURL
		}

		_, err := h.DB.GetDB().ExecContext(ctx, `
			INSERT INTO billing_invoices (
				organisation_id,
				paddle_transaction_id,
				paddle_invoice_id,
				invoice_number,
				status,
				currency_code,
				total_amount_cents,
				billed_at,
				invoice_url,
				updated_at
			) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''), $7, $8, NULLIF($9, ''), NOW())
			ON CONFLICT (paddle_transaction_id)
			DO UPDATE SET
				paddle_invoice_id = EXCLUDED.paddle_invoice_id,
				invoice_number = EXCLUDED.invoice_number,
				status = EXCLUDED.status,
				currency_code = EXCLUDED.currency_code,
				total_amount_cents = EXCLUDED.total_amount_cents,
				billed_at = EXCLUDED.billed_at,
				invoice_url = EXCLUDED.invoice_url,
				updated_at = NOW()
		`, orgID, txID, invoiceID, invoiceNumber, status, currency, totalCents, billedAt, invoiceURL)
		return err
	}

	return nil
}

func (h *Handler) callPaddleAPI(ctx context.Context, method, path string, payload any) (json.RawMessage, error) {
	apiKey := strings.TrimSpace(os.Getenv("PADDLE_API_KEY"))
	if apiKey == "" {
		return nil, fmt.Errorf("PADDLE_API_KEY is not configured")
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PADDLE_API_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = "https://api.paddle.com"
	}

	var body io.Reader = http.NoBody
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal paddle payload: %w", err)
		}
		body = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("failed to build paddle request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := paddleHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paddle API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read paddle response: %w", err)
	}

	var parsed paddleAPIEnvelope
	if len(respBody) > 0 {
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return nil, fmt.Errorf("failed to decode paddle response: %w", err)
		}
	}

	if resp.StatusCode >= 300 {
		msg := firstNonEmpty(parsed.Error.Detail, parsed.Error.Message)
		if msg == "" {
			msg = string(respBody)
		}
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("paddle API error (%d): %s", resp.StatusCode, msg)
	}

	return parsed.Data, nil
}

func verifyPaddleSignature(signatureHeader string, body []byte, secret string) bool {
	signatureHeader = strings.TrimSpace(signatureHeader)
	if signatureHeader == "" || secret == "" {
		return false
	}

	parts := strings.Split(signatureHeader, ";")
	var (
		ts string
		h1 string
	)
	for _, part := range parts {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "ts":
			ts = kv[1]
		case "h1":
			h1 = kv[1]
		}
	}
	if ts == "" || h1 == "" {
		return false
	}
	tsInt, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return false
	}
	diffSeconds := time.Now().Unix() - tsInt
	if diffSeconds < 0 {
		diffSeconds = -diffSeconds
	}
	if diffSeconds > int64((5 * time.Minute).Seconds()) {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte(":"))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(h1))
}

func parseAnyTimestamp(candidates ...string) *time.Time {
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if ts, err := time.Parse(time.RFC3339, c); err == nil {
			t := ts.UTC()
			return &t
		}
	}
	return nil
}

func parseAnyInt(candidates ...string) int {
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if n, err := strconv.Atoi(c); err == nil {
			return n
		}
	}
	return 0
}

func normaliseSubscriptionStatus(status string) string {
	switch status {
	case "inactive", "active", "trialing", "past_due", "paused", "canceled", "cancelled":
		return status
	default:
		return "unknown"
	}
}

func normaliseInvoiceStatus(status string) string {
	switch status {
	case "draft", "ready", "billed", "paid", "completed", "past_due", "canceled", "cancelled", "refunded", "failed":
		return status
	default:
		return "unknown"
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
