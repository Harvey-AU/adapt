/* global supabase — loaded via CDN <script> in index.html */
declare const supabase: {
  createClient: (
    url: string,
    key: string,
    options?: Record<string, unknown>
  ) => SupabaseClient;
};

type SupabaseClient = {
  auth: {
    setSession: (params: {
      access_token: string;
      refresh_token: string;
    }) => Promise<unknown>;
  };
  channel: (name: string) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
};

type RealtimeChannel = {
  on: (
    event: string,
    filter: Record<string, string>,
    callback: (payload: unknown) => void
  ) => RealtimeChannel;
  subscribe: (
    callback?: (status: string, err?: Error) => void
  ) => RealtimeChannel;
};

const API_BASE_STORAGE_KEY = "bbb_extension_api_base";
const API_TOKEN_STORAGE_KEY = "bbb_extension_api_token_session";
const AUTH_POPUP_WIDTH = 520;
const AUTH_POPUP_HEIGHT = 760;
const DEFAULT_BBB_APP_ORIGIN = "https://adapt-pr-255.fly.dev";
const AUTH_POPUP_NAME = "bbbExtensionAuth";
const SCHEDULE_PLACEHOLDER = "";
const SCHEDULE_OPTIONS = ["off", "6", "12", "24", "48"] as const;
const JOB_POLLING_INTERVAL_MS = 6000;

// Realtime subscription constants (mirrors dashboard pattern)
const REALTIME_DEBOUNCE_MS = 250;
const SUBSCRIBE_RETRY_INTERVAL_MS = 1000;
const FALLBACK_POLLING_INTERVAL_MS = 1000;
const MAX_SUBSCRIBE_RETRIES = 15;

const APP_ROUTES = {
  dashboard: "/dashboard",
  viewJob: "/jobs",
  changePlan: "/settings/plans",
  manageTeam: "/settings/team",
} as const;
const ACTIVE_JOB_STATUSES = new Set<string>([
  "pending",
  "queued",
  "initializing",
  "running",
  "in_progress",
  "processing",
]);

declare const webflow: {
  getSiteInfo: () => Promise<{
    siteId: string;
    siteName: string;
    shortName: string;
    isPasswordProtected: boolean;
    isPrivateStaging: boolean;
    workspaceId: string;
    workspaceSlug: string;
    domains: Array<{
      url: string;
      lastPublished: string | null;
      default: boolean;
      stage: "staging" | "production";
    }>;
  }>;
};

type ScheduleOption = (typeof SCHEDULE_OPTIONS)[number] | "";

type SuccessResponse<T> = {
  status: string;
  data?: T;
  message?: string;
  request_id?: string;
};

type ApiError = {
  status: number;
  message: string;
  body?: string;
};

type Organisation = {
  id: string;
  name: string;
};

type OrganisationsResponse = {
  organisations: Organisation[];
  active_organisation_id?: string;
};

type UsageStats = {
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
  usage_percentage: number;
  plan_name: string;
  plan_display_name: string;
};

type UsageResponse = {
  usage: UsageStats;
};

type JobItem = {
  id: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  skipped_tasks: number;
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number | null;
  avg_time_per_task_seconds?: number | null;
  domains?: {
    name: string;
  };
};

type JobListResponse = {
  jobs: JobItem[];
};

type Scheduler = {
  id: string;
  domain: string;
  schedule_interval_hours: number;
  is_enabled: boolean;
};

type CreateJobRequest = {
  domain: string;
  source_type: string;
  source_detail: string;
};

type WebflowConnection = {
  id: string;
  webflow_workspace_id?: string;
  workspace_name?: string;
};

type WebflowSiteSetting = {
  webflow_site_id: string;
  site_name: string;
  primary_domain: string;
  connection_id?: string;
  auto_publish_enabled: boolean;
  schedule_interval_hours?: number;
  scheduler_id?: string;
};

type WebflowSitesResponse = {
  sites: WebflowSiteSetting[];
  pagination?: {
    has_next: boolean;
  };
};

type AuthMessage = {
  source?: string;
  type?: string;
  state?: string;
  extensionState?: string;
  accessToken?: string;
};

type ErrorPayload = {
  code?: string;
  message?: string;
};

function extractErrorMessage(rawBody?: string): string {
  if (!rawBody) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawBody) as ErrorPayload;
    if (parsed?.message) {
      return parsed.message;
    }
  } catch (_error) {
    // ignore parse failures
  }

  return rawBody;
}

const ui = {
  // Status messages
  statusText: document.getElementById("statusText"),
  detailText: document.getElementById("detailText"),

  // Auth states
  unauthState: document.getElementById("unauthState"),
  authState: document.getElementById("authState"),

  // Unauth buttons
  checkSiteButton: document.getElementById("checkSiteButton"),
  signInButton: document.getElementById("signInButton"),

  // Top bar
  orgSelect: document.getElementById("orgSelect") as HTMLSelectElement | null,
  planNameText: document.getElementById("planNameText"),
  planRemainingText: document.getElementById("planRemainingText"),
  planRemainingValue: document.getElementById("planRemainingValue"),
  settingsButton: document.getElementById("settingsButton"),

  // Action bar
  runNowButton: document.getElementById("runNowButton"),
  scheduleSelect: document.getElementById(
    "scheduleSelect"
  ) as HTMLSelectElement | null,
  webflowPublishToggle: document.getElementById(
    "runPublishToggle"
  ) as HTMLInputElement | null,

  // Job card
  jobSection: document.getElementById("jobSection"),
  noJobState: document.getElementById("noJobState"),
  jobStatusIcon: document.getElementById("jobStatusIcon"),
  jobStatusLabel: document.getElementById("jobStatusLabel"),
  jobProgressText: document.getElementById("jobProgressText"),
  jobIssuePills: document.getElementById("jobIssuePills"),
  viewReportButton: document.getElementById("viewReportButton"),
  checkSiteAuthButton: document.getElementById("checkSiteAuthButton"),

  // Recent results
  recentResultsList: document.getElementById("recentResultsList"),

  // Mini chart
  miniChart: document.getElementById("miniChart"),

  // Footer
  feedbackButton: document.getElementById("feedbackButton"),
  helpButton: document.getElementById("helpButton"),
};

type ExtensionState = {
  apiBaseUrl: string;
  token: string | null;
  siteDomain: string | null;
  siteName: string | null;
  siteDomainCandidates: string[];
  pendingAuthAction?: () => Promise<void> | void;
  organisations: Organisation[];
  activeOrganisationId: string;
  currentJob: JobItem | null;
  usage: UsageStats | null;
  currentScheduler: Scheduler | null;
  webflowConnected: boolean;
  webflowAutoPublishEnabled: boolean;
};

const state: ExtensionState = {
  apiBaseUrl: getStoredBaseUrl(),
  token: getStoredToken(),
  siteDomain: null,
  siteName: null,
  siteDomainCandidates: [],
  organisations: [],
  activeOrganisationId: "",
  currentJob: null,
  usage: null,
  currentScheduler: null,
  webflowConnected: false,
  webflowAutoPublishEnabled: false,
};

let jobStatusPoller: number | null = null;
let jobPollInFlight = false;

// Supabase realtime state
let supabaseClient: SupabaseClient | null = null;
let jobsChannel: RealtimeChannel | null = null;
let subscribeRetryCount = 0;
let subscribeRetryTimeoutId: number | null = null;
let fallbackPollingIntervalId: number | null = null;
let lastRealtimeRefresh = 0;
let throttleTimeoutId: number | null = null;
let isRealtimeRefreshing = false;
let cleanupHandlerRegistered = false;

function getStoredBaseUrl(): string {
  return localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_BBB_APP_ORIGIN;
}

function getStoredToken(): string | null {
  return sessionStorage.getItem(API_TOKEN_STORAGE_KEY);
}

function setStoredToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(API_TOKEN_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(API_TOKEN_STORAGE_KEY);
  }
  state.token = token;
}

type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

async function fetchSupabaseConfig(): Promise<SupabaseConfig | null> {
  try {
    const response = await fetch(`${state.apiBaseUrl}/config.js`);
    if (!response.ok) {
      console.warn("Failed to fetch Supabase config:", response.status);
      return null;
    }

    const scriptText = await response.text();
    // config.js sets window.BBB_CONFIG = { supabaseUrl, supabaseAnonKey, ... }
    // Parse the JSON object from the assignment.
    const match = scriptText.match(/window\.BBB_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!match?.[1]) {
      console.warn("Could not parse BBB_CONFIG from config.js");
      return null;
    }

    const config = JSON.parse(match[1]) as Record<string, string>;
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn("Supabase config missing url or anon key");
      return null;
    }

    return {
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
    };
  } catch (error) {
    console.warn("Error fetching Supabase config:", error);
    return null;
  }
}

async function initSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!state.token) {
    return null;
  }

  const config = await fetchSupabaseConfig();
  if (!config) {
    return null;
  }

  if (typeof supabase === "undefined" || !supabase?.createClient) {
    console.warn("Supabase SDK not loaded — realtime unavailable");
    return null;
  }

  supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Set the session using the JWT we already have from extension auth.
  // No refresh token available — the extension auth flow only returns the access token.
  await supabaseClient.auth.setSession({
    access_token: state.token,
    refresh_token: "",
  });

  return supabaseClient;
}

function asNode(element: Element | null): HTMLElement | null {
  return element instanceof HTMLElement ? element : null;
}

function asInput(element: Element | null): HTMLInputElement | null {
  return element instanceof HTMLInputElement ? element : null;
}

function asSelect(element: Element | null): HTMLSelectElement | null {
  return element instanceof HTMLSelectElement ? element : null;
}

function getSiteDomainCandidates(): string[] {
  const normalised = new Set(
    state.siteDomainCandidates
      .map((candidate) => normalizeDomain(candidate))
      .filter(Boolean)
  );
  if (state.siteDomain) {
    normalised.add(state.siteDomain);
  }
  return [...normalised];
}

function hide(el: HTMLElement | null): void {
  if (el) {
    el.classList.add("hidden");
  }
}

function show(el: HTMLElement | null): void {
  if (el) {
    el.classList.remove("hidden");
  }
}

function setText(node: Element | null, value: string): void {
  if (node) {
    node.textContent = value;
  }
}

function normalizeDomain(input: string): string {
  const trimmed = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.split("/")[0] || trimmed;
}

function statusClassForJob(status: string): string {
  if (status === "completed") {
    return "status-dot-success";
  }

  if (
    status === "running" ||
    status === "initializing" ||
    status === "pending"
  ) {
    return "status-dot-warning";
  }

  return "status-dot-danger";
}

function statusLabelForJob(status: string): string {
  if (status === "completed") {
    return "DONE";
  }

  if (status === "running" || status === "initializing") {
    return "IN PROGRESS";
  }

  if (status === "pending") {
    return "QUEUED";
  }

  if (status === "cancelled") {
    return "CANCELLED";
  }

  return "ERROR";
}

function normalizeJobStatus(status: string): string {
  return status.trim().toLowerCase();
}

function isActiveJobStatus(status: string): boolean {
  return ACTIVE_JOB_STATUSES.has(normalizeJobStatus(status));
}

function pickLatestJobForCurrentSite(
  jobs: JobItem[] | undefined
): JobItem | null {
  const candidates = getSiteDomainCandidates();
  return (
    jobs?.find((job) => {
      const jobDomain = normalizeDomain(job.domains?.name || "");
      return !candidates.length || candidates.includes(jobDomain);
    }) || null
  );
}

function stopJobStatusPolling(): void {
  if (jobStatusPoller !== null) {
    window.clearInterval(jobStatusPoller);
    jobStatusPoller = null;
  }
}

function startJobStatusPolling(): void {
  // When realtime is active, the realtime subscription + fallback polling
  // handle all refreshes. Only start the legacy 6s poller if we have no
  // realtime channel (e.g. Supabase config unavailable).
  if (jobsChannel || fallbackPollingIntervalId) {
    return;
  }

  stopJobStatusPolling();

  if (!state.token || !state.currentJob || !state.siteDomain) {
    return;
  }

  if (!isActiveJobStatus(state.currentJob.status)) {
    return;
  }

  jobStatusPoller = window.setInterval(() => {
    void refreshCurrentJob();
  }, JOB_POLLING_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Realtime: throttled refresh, fallback polling, subscription, cleanup
// ---------------------------------------------------------------------------

async function realtimeRefresh(): Promise<void> {
  if (isRealtimeRefreshing) return;
  isRealtimeRefreshing = true;
  lastRealtimeRefresh = Date.now();

  try {
    // Refresh both job state and usage stats, matching the dashboard pattern.
    await Promise.all([refreshCurrentJob(), refreshUsage()]);
  } finally {
    isRealtimeRefreshing = false;
  }
}

async function refreshUsage(): Promise<void> {
  if (!state.token) return;

  try {
    const usageData = await apiRequest<UsageResponse>("/v1/usage", {
      method: "GET",
    });
    state.usage = usageData.usage || null;
    renderUsage(state.usage);
  } catch (error) {
    // Non-critical — keep existing usage displayed.
    console.warn("Failed to refresh usage stats:", error);
  }
}

function throttledRealtimeRefresh(): void {
  // Receiving a real event proves realtime works — stop fallback polling.
  clearFallbackPolling();

  const now = Date.now();
  const timeSinceLastRefresh = now - lastRealtimeRefresh;

  if (timeSinceLastRefresh >= REALTIME_DEBOUNCE_MS && !isRealtimeRefreshing) {
    void realtimeRefresh();
    return;
  }

  // Schedule a refresh when the throttle window expires.
  if (!throttleTimeoutId && !isRealtimeRefreshing) {
    const delay = REALTIME_DEBOUNCE_MS - timeSinceLastRefresh;
    throttleTimeoutId = window.setTimeout(() => {
      throttleTimeoutId = null;
      if (!isRealtimeRefreshing) {
        void realtimeRefresh();
      }
    }, Math.max(delay, 100));
  }
}

function startFallbackPolling(): void {
  if (fallbackPollingIntervalId) return;

  fallbackPollingIntervalId = window.setInterval(() => {
    void realtimeRefresh();
  }, FALLBACK_POLLING_INTERVAL_MS);
}

function clearFallbackPolling(): void {
  if (fallbackPollingIntervalId) {
    window.clearInterval(fallbackPollingIntervalId);
    fallbackPollingIntervalId = null;
  }
}

function cleanupRealtimeSubscription(): void {
  if (subscribeRetryTimeoutId) {
    window.clearTimeout(subscribeRetryTimeoutId);
    subscribeRetryTimeoutId = null;
  }

  if (throttleTimeoutId) {
    window.clearTimeout(throttleTimeoutId);
    throttleTimeoutId = null;
  }

  clearFallbackPolling();

  if (jobsChannel && supabaseClient) {
    supabaseClient.removeChannel(jobsChannel);
    jobsChannel = null;
  }

  subscribeRetryCount = 0;
  cleanupHandlerRegistered = false;
}

async function subscribeToJobUpdates(): Promise<void> {
  const orgId = state.activeOrganisationId;
  if (!orgId || !supabaseClient) {
    if (subscribeRetryCount < MAX_SUBSCRIBE_RETRIES) {
      subscribeRetryCount++;
      subscribeRetryTimeoutId = window.setTimeout(
        () => void subscribeToJobUpdates(),
        SUBSCRIBE_RETRY_INTERVAL_MS
      );
    } else {
      console.warn("[Realtime] Max retries reached, enabling fallback polling");
      startFallbackPolling();
    }
    return;
  }

  // Reset retry state on success.
  subscribeRetryCount = 0;
  subscribeRetryTimeoutId = null;

  // Clean up existing subscription if any.
  if (jobsChannel && supabaseClient) {
    try {
      await supabaseClient.removeChannel(jobsChannel);
    } catch (_e) {
      // Ignore removal errors.
    }
    jobsChannel = null;
  }

  // Register cleanup handler once.
  if (!cleanupHandlerRegistered) {
    window.addEventListener("beforeunload", cleanupRealtimeSubscription);
    cleanupHandlerRegistered = true;
  }

  try {
    const channel = supabaseClient
      .channel(`jobs-changes:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => throttledRealtimeRefresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "jobs",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => throttledRealtimeRefresh()
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "jobs",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => throttledRealtimeRefresh()
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
          console.warn(
            "[Realtime] Connection issue, fallback polling will continue"
          );
        }
        // Fallback polling stops only when we receive an actual realtime event.
      });

    // Start fallback polling immediately — cleared when a real event arrives.
    startFallbackPolling();
    jobsChannel = channel;
  } catch (err) {
    console.error("[Realtime] Failed to subscribe to jobs:", err);
    startFallbackPolling();
  }
}

// ---------------------------------------------------------------------------

async function refreshCurrentJob(): Promise<void> {
  if (jobPollInFlight || !state.token || !state.siteDomain) {
    stopJobStatusPolling();
    return;
  }

  try {
    jobPollInFlight = true;
    const response = await apiRequest<JobListResponse>("/v1/jobs?limit=50", {
      method: "GET",
    });
    const latest = pickLatestJobForCurrentSite(response.jobs);
    state.currentJob = latest;
    renderJobState(latest);

    if (!isActiveJobStatus(state.currentJob?.status || "")) {
      stopJobStatusPolling();
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      ((error as ApiError).status === 401 || (error as ApiError).status === 403)
    ) {
      stopJobStatusPolling();
      handleAuthError(error);
      return;
    }
    console.error("Failed to refresh current job", error);
  } finally {
    jobPollInFlight = false;
  }
}

function formatDate(value?: string): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString();
}

function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      message: response.statusText || "Request failed",
      body: "",
    };
    return response
      .text()
      .then((bodyText) => {
        error.body = bodyText;
        throw error;
      })
      .catch(() => {
        throw error;
      });
  }

  return response
    .json()
    .then((payload: SuccessResponse<T>) => {
      if (!payload || payload.status !== "success") {
        throw new Error(payload.message || "Unexpected response format");
      }

      if (payload.data === undefined) {
        throw new Error("Missing response data");
      }

      return payload.data;
    })
    .catch((error) => {
      if (error instanceof SyntaxError) {
        throw new Error("Failed to parse API response");
      }
      throw error;
    });
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers as HeadersInit);
  headers.set("Accept", "application/json");

  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  return parseApiResponse<T>(response);
}

function getPopupPosition() {
  const left =
    window.screenX + Math.max(0, (window.outerWidth - AUTH_POPUP_WIDTH) / 2);
  const top =
    window.screenY + Math.max(0, (window.outerHeight - AUTH_POPUP_HEIGHT) / 2);
  return { left: Math.floor(left), top: Math.floor(top) };
}

function createAuthStateValue(): string {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `${Date.now()}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function connectAccount(): Promise<string | null> {
  const authBase = new URL(state.apiBaseUrl);
  const stateToken = createAuthStateValue();
  const authUrl = `${state.apiBaseUrl}/extension-auth.html?origin=${encodeURIComponent(window.location.origin)}&extension_state=${encodeURIComponent(stateToken)}&state=${encodeURIComponent(stateToken)}`;
  const popupPosition = getPopupPosition();
  const popupFeatures = `width=${AUTH_POPUP_WIDTH},height=${AUTH_POPUP_HEIGHT},left=${popupPosition.left},top=${popupPosition.top},resizable=yes,scrollbars=yes`;

  const popup = window.open(
    authUrl,
    AUTH_POPUP_NAME,
    popupFeatures
  ) as Window | null;

  if (!popup) {
    setStatus(
      "Popup blocked. Allow popups for Webflow Designer and try again.",
      "error"
    );
    return null;
  }

  try {
    const message = await new Promise<AuthMessage>((resolve, reject) => {
      let settled = false;
      let closedTimer: number | undefined;

      const onMessage = (event: MessageEvent) => {
        if (event.source !== popup) {
          return;
        }
        if (event.origin !== authBase.origin || event.source === null) {
          return;
        }

        const payload = event.data as AuthMessage;
        const payloadState = payload?.state || payload?.extensionState;

        if (
          payload?.source !== "bbb-extension-auth" ||
          payloadState !== stateToken
        ) {
          console.warn(
            "extension auth: ignoring popup message (state mismatch)",
            {
              expected: stateToken,
              received: payload?.state,
              type: payload?.type,
            }
          );
          return;
        }

        settled = true;
        cleanup();
        resolve(payload);
      };

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (closedTimer) {
          window.clearInterval(closedTimer);
        }
      };

      const onClose = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error("Auth window closed before sign-in completed"));
      };

      window.addEventListener("message", onMessage);
      closedTimer = window.setInterval(() => {
        if (popup.closed) {
          onClose();
        }
      }, 500);
    });

    if (message.type === "success" && message.accessToken) {
      setStoredToken(message.accessToken);
      setStatus("", "");
      return message.accessToken;
    }

    setStatus(message.type || "Auth failed", "error");
    return null;
  } finally {
    if (popup && !popup.closed) {
      popup.close();
    }
  }
}

async function ensureSignedIn(): Promise<boolean> {
  if (state.token) {
    return true;
  }

  const token = await connectAccount();
  return Boolean(token);
}

function setStatus(message: string, detail = "") {
  setText(ui.statusText, message);
  setText(ui.detailText, detail);
}

function renderAuthState(isAuthed: boolean): void {
  if (isAuthed) {
    hide(asNode(ui.unauthState));
    show(asNode(ui.authState));
    return;
  }

  show(asNode(ui.unauthState));
  hide(asNode(ui.authState));
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function dotClassForJob(status: string): string {
  if (status === "completed") {
    return "dot dot-success";
  }

  if (
    status === "running" ||
    status === "initializing" ||
    status === "pending"
  ) {
    return "dot dot-warn-ring";
  }

  return "dot dot-danger";
}

/** Show the in-progress card only for active jobs; hide for completed/none. */
function renderJobState(job: JobItem | null): void {
  if (!job || !isActiveJobStatus(job.status)) {
    stopJobStatusPolling();
    hide(asNode(ui.jobSection));
    // Show no-job placeholder only when there are zero jobs at all
    // (if there are completed jobs, recent results will fill the space)
    return;
  }

  show(asNode(ui.jobSection));

  // Status dot
  if (ui.jobStatusIcon) {
    ui.jobStatusIcon.className = dotClassForJob(job.status);
  }

  // Status label
  setText(ui.jobStatusLabel, statusLabelForJob(job.status));

  // Progress: "218 / 372 pages"
  setText(
    ui.jobProgressText,
    `${job.completed_tasks} / ${job.total_tasks} pages`
  );

  // Issue pills on the in-progress card
  renderIssuePillsInto(ui.jobIssuePills, job);
}

/** Render issue-category pills into a container. */
function renderIssuePillsInto(
  container: HTMLElement | null,
  job: JobItem
): void {
  if (!container) {
    return;
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // TODO: when task-level breakdown API is available, split into
  // broken_links, very_slow, slow counts. For now derive from failed_tasks.
  const brokenLinks = job.failed_tasks;
  // TODO: replace placeholders with real per-task timing data from API
  const verySlow = job.skipped_tasks || 2; // placeholder
  const slow = Math.max(1, Math.floor(job.total_tasks * 0.05)); // placeholder

  if (brokenLinks > 0) {
    container.appendChild(
      makePill("dot-danger", `${brokenLinks} broken link${brokenLinks !== 1 ? "s" : ""}`)
    );
  }
  if (verySlow > 0) {
    container.appendChild(
      makePill("dot-danger", `${verySlow} very slow`)
    );
  }
  if (slow > 0) {
    container.appendChild(makePill("dot-warn", `${slow} slow`));
  }
}

function makePill(dotClass: string, label: string): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.className = "issue-pill";
  pill.innerHTML = `<span class="dot ${dotClass}"></span> ${label}`;
  return pill;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatShortDate(value?: string): string {
  if (!value) {
    return "";
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const day = d.getDate();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[d.getMonth()];
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const h = hours % 12 || 12;

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";

  return `${day}${suffix} ${month} ${h}:${minutes}${ampm}`;
}

// ---------------------------------------------------------------------------
// Recent results list (completed jobs only)
// ---------------------------------------------------------------------------

function filterSiteJobs(jobs: JobItem[]): JobItem[] {
  const candidates = getSiteDomainCandidates();
  return jobs.filter((job) => {
    const jobDomain = normalizeDomain(job.domains?.name || "");
    return !candidates.length || candidates.includes(jobDomain);
  });
}

function renderRecentResults(jobs: JobItem[]): void {
  const container = ui.recentResultsList;
  if (!container) {
    return;
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const siteJobs = filterSiteJobs(jobs);

  // All completed / non-active jobs go here
  const completedJobs = siteJobs.filter(
    (job) => !isActiveJobStatus(job.status)
  );

  // Show/hide no-job state based on whether there are ANY jobs
  if (siteJobs.length === 0) {
    show(asNode(ui.noJobState));
  } else {
    hide(asNode(ui.noJobState));
  }

  if (completedJobs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail";
    empty.textContent = "No completed runs yet.";
    container.appendChild(empty);
    return;
  }

  // Show up to 3 recent completed jobs — one card per job
  for (const job of completedJobs.slice(0, 3)) {
    container.appendChild(buildResultCard(job));
  }
}

// ---------------------------------------------------------------------------
// Result card builder
// ---------------------------------------------------------------------------

function buildResultCard(job: JobItem): HTMLElement {
  const card = document.createElement("div");
  card.className = "result-card";

  const successCount = Math.max(0, job.completed_tasks - job.failed_tasks);
  const dateStr = formatShortDate(job.completed_at || job.created_at);

  // ── Row 1: date + success / total ──
  const header = document.createElement("div");
  header.className = "result-card-header";
  header.innerHTML = `
    <p class="result-card-date">${dateStr}</p>
    <div class="result-card-success">
      <span class="dot dot-success"></span>
      <span class="result-card-success-count">${successCount} Success</span>
      <span class="result-card-success-total">/ ${job.total_tasks} pages</span>
    </div>`;
  card.appendChild(header);

  // ── Row 2: speed stats ──
  const stats = document.createElement("div");
  stats.className = "result-card-stats";

  if (job.avg_time_per_task_seconds) {
    const avgMs = Math.round(job.avg_time_per_task_seconds * 1000);
    stats.innerHTML += `<span>Avg: ${avgMs.toLocaleString()}ms</span>`;
  }
  // TODO: connect slowest, saved, cached when per-job timing stats available
  // Placeholder values shown to match Figma layout
  if (job.duration_seconds) {
    const totalMs = Math.round(job.duration_seconds * 1000);
    stats.innerHTML += `<span>Saved: ${totalMs.toLocaleString()}ms</span>`;
  }
  // TODO: "Cached: XX%" needs cache-hit data from API
  card.appendChild(stats);

  // ── Row 3: issue pills (tabs) + issues detail table ──
  // Derive counts — TODO: replace with real per-task timing data from API
  const brokenLinks = job.failed_tasks;
  const verySlow = job.skipped_tasks || 2; // placeholder until API provides timing breakdown
  const slow = Math.max(1, Math.floor(job.total_tasks * 0.05)); // placeholder

  const issuesContainer = document.createElement("div");
  issuesContainer.className = "issues-detail";

  // Tab row
  const tabs = document.createElement("div");
  tabs.className = "issues-tabs";

  type TabDef = { dotClass: string; label: string; count: number; key: string };
  const tabDefs: TabDef[] = [
    {
      dotClass: "dot-danger",
      label: "broken link",
      count: brokenLinks,
      key: "broken",
    },
    {
      dotClass: "dot-danger",
      label: "very slow",
      count: verySlow,
      key: "veryslow",
    },
    { dotClass: "dot-warn", label: "slow", count: slow, key: "slow" },
  ];

  // Detail table panel (hidden by default, shown on tab click)
  const tablePanel = document.createElement("div");
  tablePanel.className = "issues-table hidden";

  let hasAnyIssues = false;
  const tabElements: HTMLElement[] = [];

  for (const def of tabDefs) {
    if (def.count <= 0) {
      continue;
    }
    hasAnyIssues = true;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "issues-tab";
    tab.dataset.tabKey = def.key;
    tab.innerHTML = `<span class="dot ${def.dotClass}"></span> ${def.count} ${def.label}${def.count !== 1 && def.label === "broken link" ? "s" : ""}`;

    tab.addEventListener("click", () => {
      // Toggle: if already active, collapse
      const wasActive = tab.classList.contains("active");

      // Deactivate all tabs
      for (const t of tabElements) {
        t.classList.remove("active");
      }

      if (wasActive) {
        hide(tablePanel);
        return;
      }

      tab.classList.add("active");
      show(tablePanel);
      renderIssuesTable(tablePanel, job, def.key);
    });

    tabs.appendChild(tab);
    tabElements.push(tab);
  }

  if (hasAnyIssues) {
    issuesContainer.appendChild(tabs);
    issuesContainer.appendChild(tablePanel);
    card.appendChild(issuesContainer);
  }

  // ── Row 4: pills row (for non-tab display) + CSV button ──
  const pillsRow = document.createElement("div");
  pillsRow.className = "result-card-pills";

  // If no issues, still show the pill row for CSV button
  if (!hasAnyIssues) {
    // No issue tabs needed
  }

  // CSV export button
  const csvBtn = document.createElement("button");
  csvBtn.type = "button";
  csvBtn.className = "btn-outline-sm";
  csvBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> CSV Results`;
  csvBtn.addEventListener("click", () => {
    void exportJob(job.id);
  });
  pillsRow.appendChild(csvBtn);

  card.appendChild(pillsRow);

  return card;
}

// ---------------------------------------------------------------------------
// Issues detail table (inside a result card, toggled by tab click)
// ---------------------------------------------------------------------------

function renderIssuesTable(
  panel: HTMLElement,
  _job: JobItem,
  tabKey: string
): void {
  while (panel.firstChild) {
    panel.removeChild(panel.firstChild);
  }

  // TODO: fetch task-level issue data from API
  // e.g. GET /v1/jobs/{id}/tasks?status=failed or similar
  // For now, show placeholder rows

  const columnLabels: Record<string, [string, string]> = {
    broken: ["Broken URL", "Found at"],
    veryslow: ["Slow URL", "Response time"],
    slow: ["URL", "Response time"],
  };

  const [col1Label, col2Label] = columnLabels[tabKey] || [
    "URL",
    "Details",
  ];

  // Placeholder data — TODO: replace with real task data from API
  const placeholderRows: [string, string][] =
    tabKey === "broken"
      ? [
          ["/about-us/team", "/contact"],
          ["/blog/old-post", "/homepage"],
          ["/resources/download", "/pricing"],
        ]
      : tabKey === "veryslow"
        ? [
            ["/gallery/portfolio", "4,200ms"],
            ["/shop/all-products", "3,800ms"],
            ["/blog/media-heavy", "3,500ms"],
          ]
        : [
            ["/services/consulting", "1,800ms"],
            ["/about-us", "1,500ms"],
            ["/faq", "1,200ms"],
          ];

  // Build two-column table
  const body = document.createElement("div");
  body.className = "issues-table-body";

  const col1 = document.createElement("div");
  col1.className = "issues-table-col";
  col1.innerHTML = `<div class="issues-table-heading">${col1Label}</div>`;

  const col2 = document.createElement("div");
  col2.className = "issues-table-col";
  col2.innerHTML = `<div class="issues-table-heading">${col2Label}</div>`;

  for (const [val1, val2] of placeholderRows) {
    const row1 = document.createElement("div");
    row1.className = "issues-table-row";
    row1.innerHTML = `<span class="issues-table-cell">${val1}</span>`;
    col1.appendChild(row1);

    const row2 = document.createElement("div");
    row2.className = "issues-table-row";
    row2.innerHTML = `<span class="issues-table-cell">${val2}</span>`;
    col2.appendChild(row2);
  }

  body.appendChild(col1);
  body.appendChild(col2);
  panel.appendChild(body);

  // "View all" footer link
  const footer = document.createElement("div");
  footer.className = "issues-table-footer";
  // TODO: update count and link to full report when API data is available
  const viewAllBtn = document.createElement("button");
  viewAllBtn.type = "button";
  viewAllBtn.className = "btn-link-blue";
  viewAllBtn.textContent = `View all ${tabKey === "broken" ? "broken links" : tabKey === "veryslow" ? "very slow pages" : "slow pages"}`;
  viewAllBtn.addEventListener("click", () => {
    const detailPath = _job.id
      ? `${APP_ROUTES.viewJob}/${encodeURIComponent(_job.id)}`
      : APP_ROUTES.dashboard;
    openSettingsPage(detailPath);
  });
  footer.appendChild(viewAllBtn);
  panel.appendChild(footer);
}

// ---------------------------------------------------------------------------
// Job export
// ---------------------------------------------------------------------------

async function exportJob(jobId: string): Promise<void> {
  try {
    const response = await fetch(
      `${state.apiBaseUrl}/v1/jobs/${jobId}/export`,
      {
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
      }
    );

    if (!response.ok) {
      throw new Error(`Export failed (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${jobId}-adapt-export.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setStatus(
      "Export failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

// ---------------------------------------------------------------------------
// Mini chart
// ---------------------------------------------------------------------------

function renderMiniChart(jobs: JobItem[]): void {
  const container = ui.miniChart;
  if (!container) {
    return;
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const siteJobs = filterSiteJobs(jobs).slice(0, 6);

  if (siteJobs.length === 0) {
    return;
  }

  const maxFailed = Math.max(...siteJobs.map((j) => j.failed_tasks), 1);

  for (const job of siteJobs) {
    const bar = document.createElement("div");
    bar.className = "chart-bar";

    // Red segment = broken links (failed_tasks)
    // Amber segment = slow pages (skipped_tasks as proxy)
    // TODO: replace with real broken vs slow split from task-level data
    if (job.failed_tasks > 0) {
      const seg = document.createElement("div");
      seg.className = "chart-bar-danger";
      seg.style.height = `${Math.max(4, Math.round((job.failed_tasks / maxFailed) * 30))}px`;
      bar.appendChild(seg);
    }

    if (job.skipped_tasks > 0) {
      const seg = document.createElement("div");
      seg.className = "chart-bar-warn";
      seg.style.height = `${Math.max(4, Math.round((job.skipped_tasks / maxFailed) * 30))}px`;
      bar.appendChild(seg);
    }

    if (bar.children.length > 0) {
      container.appendChild(bar);
    }
  }
}

function renderUsage(usage: UsageStats | null): void {
  if (!usage) {
    if (ui.planNameText) {
      ui.planNameText.innerHTML = "<strong>Plan:</strong> \u2014";
    }
    setText(ui.planRemainingValue, "\u2014");
    return;
  }

  const plan = usage.plan_display_name || usage.plan_name || "Plan";
  const limit = usage.daily_limit.toLocaleString();

  if (ui.planNameText) {
    ui.planNameText.innerHTML = `<strong>Plan:</strong> <strong>${plan}</strong> (${limit} pages / day)`;
  }

  const remaining = usage.daily_remaining.toLocaleString();
  setText(ui.planRemainingValue, `${remaining} pages remaining`);
}

function renderOrganisations() {
  const select = asSelect(ui.orgSelect);
  if (!select) {
    return;
  }

  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }

  if (state.organisations.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.textContent = "No organisations";
    placeholder.value = "";
    select.appendChild(placeholder);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  state.organisations.forEach((org) => {
    const option = document.createElement("option");
    option.value = org.id;
    option.textContent = org.name;
    option.selected = org.id === state.activeOrganisationId;
    select.appendChild(option);
  });
}

function renderWebflowStatus(isConnected: boolean) {
  if (!ui.webflowPublishToggle) {
    return;
  }

  ui.webflowPublishToggle.checked =
    isConnected && state.webflowAutoPublishEnabled;
}

function renderScheduleState(): void {
  const scheduleSelect = asSelect(ui.scheduleSelect);
  if (!scheduleSelect) {
    return;
  }

  if (!state.currentScheduler || !state.currentScheduler.is_enabled) {
    scheduleSelect.value = SCHEDULE_PLACEHOLDER;
    return;
  }

  const hours = String(state.currentScheduler.schedule_interval_hours);
  if (SCHEDULE_OPTIONS.includes(hours as any)) {
    scheduleSelect.value = hours;
  }
}

function buildAppUrl(path: string): string {
  try {
    const trimmedBase = state.apiBaseUrl.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, `${trimmedBase}/`).toString();
  } catch (error) {
    console.error("Failed to build app URL", error);
    return `${state.apiBaseUrl.replace(/\/+$/, "")}/${path}`;
  }
}

function setLoading(element: Element | null, disabled: boolean): void {
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement
  ) {
    element.disabled = disabled;
  }
}

function setDisabledAll(disabled: boolean): void {
  const controls: (Element | null)[] = [
    ui.checkSiteButton,
    ui.checkSiteAuthButton,
    ui.signInButton,
    ui.runNowButton,
    ui.viewReportButton,
    ui.scheduleSelect,
    ui.orgSelect,
    ui.webflowPublishToggle,
    ui.settingsButton,
  ];

  for (const control of controls) {
    setLoading(control, disabled);
  }

  const toggle = asInput(ui.webflowPublishToggle);
  if (toggle) {
    toggle.disabled = disabled;
  }
}

async function loadCurrentSiteInfo() {
  try {
    const siteInfo = await webflow.getSiteInfo();
    const stageFiltered = siteInfo.domains.filter(
      (domain) => domain.stage === "staging" || domain.stage === "production"
    );
    state.siteDomainCandidates = stageFiltered.map(
      (candidate) => candidate.url
    );

    const preferredDomain =
      stageFiltered.find((domain) => domain.default)?.url ||
      stageFiltered.find((domain) => domain.stage === "production")?.url ||
      stageFiltered.find((domain) => domain.stage === "staging")?.url;

    state.siteDomain = preferredDomain
      ? normalizeDomain(preferredDomain)
      : stageFiltered[0]
        ? normalizeDomain(stageFiltered[0].url)
        : normalizeDomain(siteInfo.shortName);
    state.siteName = siteInfo.siteName;
    return state.siteDomain;
  } catch (error) {
    console.error("Failed to get site info", error);
    return null;
  }
}

async function loadLatestJob(): Promise<void> {
  if (!state.siteDomain || !state.token) {
    state.currentJob = null;
    renderJobState(null);
    renderRecentResults([]);
    renderMiniChart([]);
    stopJobStatusPolling();
    return;
  }

  try {
    const response = await apiRequest<JobListResponse>("/v1/jobs?limit=50", {
      method: "GET",
    });

    const latest = pickLatestJobForCurrentSite(response.jobs);
    state.currentJob = latest;
    renderJobState(latest);
    renderRecentResults(response.jobs);
    renderMiniChart(response.jobs);
    startJobStatusPolling();
  } catch (error) {
    state.currentJob = null;
    renderJobState(null);
    renderRecentResults([]);
    renderMiniChart([]);
    stopJobStatusPolling();
    console.error(error);
  }
}

async function loadUsageAndOrgs(): Promise<void> {
  if (!state.token) {
    state.organisations = [];
    state.usage = null;
    state.currentScheduler = null;
    return;
  }

  const [orgData, usageData] = await Promise.all([
    apiRequest<OrganisationsResponse>("/v1/organisations", { method: "GET" }),
    apiRequest<UsageResponse>("/v1/usage", { method: "GET" }),
  ]);

  state.organisations = orgData.organisations || [];
  state.activeOrganisationId =
    orgData.active_organisation_id || state.activeOrganisationId;
  state.usage = usageData.usage || null;
}

async function loadCurrentSchedule(): Promise<void> {
  if (!state.siteDomain || !state.token) {
    state.currentScheduler = null;
    renderScheduleState();
    return;
  }

  const siteDomain = normalizeDomain(state.siteDomain);
  const schedulers = await apiRequest<Scheduler[]>("/v1/schedulers", {
    method: "GET",
  });
  const matching = schedulers.find(
    (scheduler) => normalizeDomain(scheduler.domain) === siteDomain
  );
  state.currentScheduler = matching || null;
  renderScheduleState();
}

async function findConnectedWebflowSite(): Promise<WebflowSiteSetting | null> {
  if (!state.token || !state.siteDomain) {
    renderWebflowStatus(false);
    return null;
  }

  const connections = await apiRequest<WebflowConnection[]>(
    "/v1/integrations/webflow",
    { method: "GET" }
  );

  if (!connections || connections.length === 0) {
    state.webflowConnected = false;
    state.webflowAutoPublishEnabled = false;
    renderWebflowStatus(false);
    return null;
  }

  state.webflowConnected = true;

  const candidates = getSiteDomainCandidates();
  let matched: WebflowSiteSetting | null = null;

  for (const connection of connections) {
    let page = 1;

    while (true) {
      const sites = await apiRequest<WebflowSitesResponse>(
        `/v1/integrations/webflow/${connection.id}/sites?page=${page}&limit=50`,
        { method: "GET" }
      );

      const candidate = sites.sites?.find((site) => {
        const domain = normalizeDomain(site.primary_domain);
        return candidates.includes(domain);
      });

      if (candidate) {
        matched = {
          ...candidate,
          connection_id: connection.id,
        };
        break;
      }

      if (!sites.pagination?.has_next) {
        break;
      }

      page += 1;
    }

    if (matched) {
      break;
    }
  }

  if (matched) {
    state.webflowAutoPublishEnabled = Boolean(matched.auto_publish_enabled);
    state.webflowConnected = true;
    renderWebflowStatus(true);
    return matched;
  }

  state.webflowAutoPublishEnabled = false;
  renderWebflowStatus(true);
  return null;
}

async function setWebflowAutoPublish(enabled: boolean): Promise<void> {
  // Optimistically update UI before the network round-trip.
  state.webflowAutoPublishEnabled = enabled;
  renderWebflowStatus(state.webflowConnected);

  const siteSetting = await findConnectedWebflowSite();
  if (!siteSetting) {
    state.webflowAutoPublishEnabled = false;
    renderWebflowStatus(state.webflowConnected);
    setStatus("Connect Webflow and select this site, then try again.", "");
    return;
  }
  if (!siteSetting.connection_id) {
    throw new Error("Connected Webflow site missing connection id.");
  }

  const payload = {
    connection_id: siteSetting.connection_id,
    enabled,
  };

  try {
    await apiRequest<WebflowSiteSetting>(
      `/v1/integrations/webflow/sites/${siteSetting.webflow_site_id}/auto-publish`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  } catch (error) {
    // Revert on failure.
    state.webflowAutoPublishEnabled = !enabled;
    renderWebflowStatus(state.webflowConnected);
    throw error;
  }

  // Re-apply after findConnectedWebflowSite may have overwritten state.
  state.webflowAutoPublishEnabled = enabled;
  renderWebflowStatus(state.webflowConnected);

  setStatus(
    `Auto-publish ${enabled ? "enabled" : "disabled"} for ${state.siteDomain || "this site"}`,
    ""
  );
}

async function setJobSchedule(value: ScheduleOption): Promise<void> {
  if (!state.token || !state.siteDomain) {
    return;
  }

  if (!value) {
    return;
  }

  const domain = state.siteDomain;
  if (value === "off") {
    if (state.currentScheduler) {
      await apiRequest<any>(`/v1/schedulers/${state.currentScheduler.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: false,
        }),
      });
    }
    state.currentScheduler = null;
    setStatus("Scheduler disabled for this site.", "");
    renderScheduleState();
    return;
  }

  const scheduleHours = Number(value);

  if (!state.currentScheduler) {
    const created = await apiRequest<Scheduler>("/v1/schedulers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        schedule_interval_hours: scheduleHours,
      }),
    });
    state.currentScheduler = created;
    setStatus("Schedule enabled.", "");
  } else {
    const updated = await apiRequest<Scheduler>(
      `/v1/schedulers/${state.currentScheduler.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_interval_hours: scheduleHours,
          is_enabled: true,
        }),
      }
    );
    state.currentScheduler = updated;
    setStatus("Schedule updated.", "");
  }

  renderScheduleState();
}

async function runScanForCurrentSite(): Promise<void> {
  if (!state.token) {
    const started = await ensureSignedIn();
    if (!started) {
      return;
    }
    await refreshDashboard();
  }

  if (!state.siteDomain) {
    setStatus(
      "Could not read current site domain.",
      "Open a site in the Designer and try again."
    );
    return;
  }

  const request: CreateJobRequest = {
    domain: state.siteDomain,
    source_type: "extension",
    source_detail: "webflow_designer_check",
  };

  const created = await apiRequest<JobItem>("/v1/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  state.currentJob = created;
  renderJobState(created);
  startJobStatusPolling();
  setStatus("Scan started.", "Use Run again to requeue a fresh run.");
  await refreshDashboard();
}

async function exportCurrentJob(): Promise<void> {
  if (!state.currentJob) {
    setStatus("No current job to export.", "Run a scan first.");
    return;
  }

  await exportJob(state.currentJob.id);
}

function handleAuthError(error: unknown): void {
  if (typeof error === "object" && error !== null && "status" in error) {
    const apiError = error as ApiError;
    if (apiError.status === 401) {
      setStoredToken(null);
      cleanupRealtimeSubscription();
      supabaseClient = null;
      renderAuthState(false);
      setStatus("Session expired. Sign in again.", "");
      return;
    }

    if (apiError.status === 403) {
      const message = extractErrorMessage(apiError.body);
      setStatus("Action not permitted", message);
      return;
    }

    setStatus(`API error (${apiError.status})`, apiError.body || "");
    return;
  }

  if (error instanceof Error) {
    setStatus("Request failed", error.message);
    return;
  }

  setStatus("Request failed", "Unknown error");
}

async function refreshDashboard(): Promise<void> {
  setDisabledAll(true);

  try {
    setStatus("", "");
    state.token = getStoredToken();

    renderAuthState(Boolean(state.token));

    await loadCurrentSiteInfo();
    if (!state.token) {
      state.currentJob = null;
      state.usage = null;
      state.organisations = [];
      state.currentScheduler = null;
      stopJobStatusPolling();
      cleanupRealtimeSubscription();
      supabaseClient = null;
      renderJobState(null);
      renderRecentResults([]);
      renderMiniChart([]);
      renderUsage(null);
      renderOrganisations();
      renderScheduleState();
      renderWebflowStatus(false);
      return;
    }

    try {
      await Promise.all([
        loadUsageAndOrgs(),
        loadLatestJob(),
        loadCurrentSchedule(),
        findConnectedWebflowSite(),
      ]);
      renderUsage(state.usage);
      renderOrganisations();

      // Initialise Supabase realtime; fall back to legacy polling on failure.
      const client = await initSupabaseClient();
      if (client) {
        void subscribeToJobUpdates();
      } else {
        startJobStatusPolling();
      }
    } catch (error) {
      await handleAuthError(error);
    }
  } finally {
    setDisabledAll(false);
  }
}

async function switchOrganisation(): Promise<void> {
  const select = asSelect(ui.orgSelect);
  if (!select || !select.value) {
    return;
  }

  setDisabledAll(true);
  try {
    await apiRequest<{ organisation: unknown }>("/v1/organisations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisation_id: select.value,
      }),
    });
    state.activeOrganisationId = select.value;
    await refreshDashboard();
  } finally {
    setDisabledAll(false);
  }
}

function openSettingsPage(path: string): void {
  const targetUrl = buildAppUrl(path);
  const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    setStatus("Popup blocked. Allow popups and try again.", "");
  }
}

async function connectWebflow(): Promise<void> {
  if (!state.token) {
    const token = await connectAccount();
    if (!token) {
      return;
    }
  }

  const response = await apiRequest<{ auth_url: string }>(
    "/v1/integrations/webflow",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );

  const popup = window.open(
    response.auth_url,
    "bbb-webflow-connect",
    `width=520,height=760,left=60,top=60`
  );
  if (!popup) {
    setStatus("Popup blocked. Allow popups and try again.", "");
    return;
  }

  const popupResult = await new Promise<{
    connected?: boolean;
    error?: string;
  }>((resolve) => {
    let timer: number | undefined;
    const origin = new URL(state.apiBaseUrl).origin;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== popup || event.origin !== origin) {
        return;
      }

      const payload = event.data as {
        source?: string;
        type?: string;
        connected?: boolean;
        error?: string;
      };

      if (
        payload?.source !== "bbb-webflow-connect" ||
        payload.type !== "webflow-connect-complete"
      ) {
        return;
      }

      if (timer) {
        window.clearInterval(timer);
      }
      window.removeEventListener("message", handleMessage);
      resolve({
        connected: payload.connected,
        error: payload.error,
      });
    };

    window.addEventListener("message", handleMessage);

    timer = window.setInterval(() => {
      if (popup.closed) {
        if (timer) {
          window.clearInterval(timer);
        }
        window.removeEventListener("message", handleMessage);
        resolve({});
      }
    }, 500);
  });

  if (!popup.closed) {
    popup.close();
  }

  setStatus("Webflow connection flow complete.", "Refreshing connections.");
  await refreshDashboard();

  if (popupResult?.connected) {
    try {
      await setWebflowAutoPublish(true);
    } catch (error) {
      console.warn("Unable to enable run-on-publish after connect:", error);
    }
    return;
  }

  if (popupResult?.error) {
    setStatus("Webflow connect failed.", popupResult.error);
  }
}

function initEventHandlers(): void {
  // Unauth: check site
  ui.checkSiteButton?.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  // Unauth: sign in
  ui.signInButton?.addEventListener("click", async () => {
    await connectAccount();
    await refreshDashboard();
  });

  // Auth: run now (action bar)
  ui.runNowButton?.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  // Auth: check site (no-job state)
  ui.checkSiteAuthButton?.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  // Auth: view full report
  ui.viewReportButton?.addEventListener("click", () => {
    const detailPath = state.currentJob?.id
      ? `${APP_ROUTES.viewJob}/${encodeURIComponent(state.currentJob.id)}`
      : APP_ROUTES.dashboard;
    openSettingsPage(detailPath);
  });

  // Auth: settings gear
  ui.settingsButton?.addEventListener("click", () => {
    openSettingsPage(APP_ROUTES.changePlan);
  });

  // Auth: org switcher
  ui.orgSelect?.addEventListener("change", () => {
    void switchOrganisation();
  });

  // Auth: schedule select
  ui.scheduleSelect?.addEventListener("change", async () => {
    const select = asSelect(ui.scheduleSelect);
    if (!select) {
      return;
    }

    const requested = select.value as ScheduleOption;
    try {
      await setJobSchedule(requested);
    } catch (error) {
      await handleAuthError(error);
    }
  });

  // Auth: auto-publish toggle
  ui.webflowPublishToggle?.addEventListener("change", async (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    const enabled = target.checked;
    try {
      if (enabled && !state.webflowConnected) {
        await connectWebflow();
      }
      await setWebflowAutoPublish(enabled);
    } catch (error) {
      if (target) {
        target.checked = !enabled;
      }
      await handleAuthError(error);
    }
  });

  // Footer: feedback
  // TODO: connect to feedback form or mailto link
  ui.feedbackButton?.addEventListener("click", () => {
    openSettingsPage(APP_ROUTES.dashboard);
  });

  // Footer: help
  // TODO: connect to help/docs page
  ui.helpButton?.addEventListener("click", () => {
    openSettingsPage(APP_ROUTES.dashboard);
  });
}

async function initialise(): Promise<void> {
  window.addEventListener("beforeunload", () => {
    stopJobStatusPolling();
    cleanupRealtimeSubscription();
  });
  try {
    localStorage.setItem(API_BASE_STORAGE_KEY, state.apiBaseUrl);
  } catch (_error) {
    // ignore
  }

  initEventHandlers();
  await refreshDashboard();
  renderAuthState(Boolean(state.token));

  setStatus("", "");
}

void initialise();
