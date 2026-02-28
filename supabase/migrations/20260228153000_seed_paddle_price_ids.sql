-- Seed Paddle price IDs for built-in plans.
--
-- This is additive and updates any existing plan rows by name so environments
-- already bootstrapped before this migration can be upgraded in-place.
INSERT INTO plans (
	id,
	name,
	display_name,
	daily_page_limit,
	monthly_price_cents,
	features,
	is_active,
	sort_order,
	created_at,
	updated_at,
	paddle_price_id
) VALUES
	(
		'2f9d7b93-4f3b-4eb0-8058-0cdc311afc9f',
		'free',
		'Free',
		500,
		0,
		'{}'::jsonb,
		true,
		0,
		'2026-02-14 12:30:21.847134+00',
		'2026-02-14 12:30:21.847134+00',
		NULL
	),
	(
		'9a78e3d9-519f-41ee-a0e7-cc51c51f75bb',
		'pro',
		'Pro',
		5000,
		8000,
		'{}'::jsonb,
		true,
		20,
		'2026-02-14 12:30:21.847134+00',
		'2026-02-14 12:30:21.847134+00',
		'pri_01khe19aqtvckrrby97jvr4apm'
	),
	(
		'b12cf2b0-eefc-4868-8b89-7eedda470111',
		'starter',
		'Starter',
		2000,
		5000,
		'{}'::jsonb,
		true,
		10,
		'2026-02-14 12:30:21.847134+00',
		'2026-02-14 12:30:21.847134+00',
		'pri_01khe17p2pm7b9bv84r6zm97g7'
	),
	(
		'e7d4525b-36a1-4881-b192-e53d9603b205',
		'enterprise',
		'Enterprise',
		100000,
		40000,
		'{}'::jsonb,
		true,
		40,
		'2026-02-14 12:30:21.847134+00',
		'2026-02-14 12:30:21.847134+00',
		'pri_01khe1be0kmf97nkd4arf64fx4'
	),
	(
		'eab442e5-79a1-41c2-a299-4f2f888b91dd',
		'business',
		'Business',
		10000,
		15000,
		'{}'::jsonb,
		true,
		30,
		'2026-02-14 12:30:21.847134+00',
		'2026-02-14 12:30:21.847134+00',
		'pri_01khe1a9eksehnmf4hrxmfgaas'
	)
ON CONFLICT (name) DO UPDATE
SET
	id = plans.id,
	display_name = EXCLUDED.display_name,
	daily_page_limit = EXCLUDED.daily_page_limit,
	monthly_price_cents = EXCLUDED.monthly_price_cents,
	features = EXCLUDED.features,
	is_active = EXCLUDED.is_active,
	sort_order = EXCLUDED.sort_order,
	paddle_price_id = EXCLUDED.paddle_price_id,
	updated_at = NOW();
