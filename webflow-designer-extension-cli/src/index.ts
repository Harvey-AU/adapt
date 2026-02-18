const API_BASE_STORAGE_KEY = "bbb_extension_api_base";
const API_TOKEN_STORAGE_KEY = "bbb_extension_api_token_session";
const AUTH_POPUP_WIDTH = 520;
const AUTH_POPUP_HEIGHT = 760;
const DEFAULT_BBB_APP_ORIGIN = "https://adapt.app.goodnative.co";
const AUTH_POPUP_NAME = "bbbExtensionAuth";
const SCHEDULE_PLACEHOLDER = "";
const SCHEDULE_OPTIONS = ["off", "6", "12", "24", "48"] as const;
const JOB_POLLING_INTERVAL_MS = 6000;
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
  statusText: document.getElementById("statusText"),
  detailText: document.getElementById("detailText"),
  unauthState: document.getElementById("unauthState"),
  authState: document.getElementById("authState"),
  authStatePill: document.getElementById("authStatePill"),

  checkSiteButton: document.getElementById("checkSiteButton"),
  signInButton: document.getElementById("signInButton"),
  runAgainButton: document.getElementById("runAgainButton"),
  exportButton: document.getElementById("exportButton"),
  viewDetailsButton: document.getElementById("viewDetailsButton"),
  checkSiteAuthButton: document.getElementById("checkSiteAuthButton"),

  jobSection: document.getElementById("jobSection"),
  noJobState: document.getElementById("noJobState"),

  jobStatusIcon: document.getElementById("jobStatusIcon"),
  jobStatusText: document.getElementById("jobStatusText"),
  jobSummaryText: document.getElementById("jobSummaryText"),

  orgSelect: document.getElementById("orgSelect") as HTMLSelectElement | null,
  planNameText: document.getElementById("planNameText"),
  changePlanButton: document.getElementById("changePlanButton"),
  manageTeamButton: document.getElementById("manageTeamButton"),

  scheduleSelect: document.getElementById(
    "scheduleSelect"
  ) as HTMLSelectElement | null,
  webflowPublishToggle: document.getElementById(
    "runPublishToggle"
  ) as HTMLInputElement | null,
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
    show(asNode(ui.authStatePill));
    setText(ui.authStatePill, "Connected");
    if (ui.authStatePill instanceof HTMLElement) {
      ui.authStatePill.className = "pill pill-ok";
    }
    return;
  }

  show(asNode(ui.unauthState));
  hide(asNode(ui.authState));
  hide(asNode(ui.authStatePill));
  if (ui.authStatePill instanceof HTMLElement) {
    ui.authStatePill.className = "pill";
  }
}

function renderJobState(job: JobItem | null): void {
  if (!job) {
    stopJobStatusPolling();
    hide(asNode(ui.jobSection));
    show(asNode(ui.noJobState));
    setText(ui.jobStatusIcon, "");
    setText(ui.jobStatusText, "");
    setText(ui.jobSummaryText, "");
    return;
  }

  show(asNode(ui.jobSection));
  hide(asNode(ui.noJobState));
  const status = statusLabelForJob(job.status);
  const iconClass = statusClassForJob(job.status);
  setText(ui.jobStatusIcon, "•");
  if (ui.jobStatusIcon) {
    ui.jobStatusIcon.className = `status-dot ${iconClass}`;
  }

  const domain = job.domains?.name || state.siteDomain || "current site";
  const dateText = formatDate(job.completed_at || job.created_at);
  setText(
    ui.jobStatusText,
    `${status} • ${job.total_tasks} pages • ${Math.round(job.progress)}% complete (${job.completed_tasks} done, ${job.failed_tasks} issues)`
  );
  setText(ui.jobSummaryText, `${domain} • Latest run ${dateText}`);
}

function renderUsage(usage: UsageStats | null): void {
  if (!usage) {
    setText(ui.planNameText, "Plan: —");
    return;
  }

  const plan = usage.plan_display_name || usage.plan_name;
  const used = usage.daily_used.toLocaleString();
  const remainingPercent = Math.max(
    0,
    Math.min(100, Math.round(100 - usage.usage_percentage))
  );
  setText(
    ui.planNameText,
    `Plan: ${plan || "Plan"} (${remainingPercent}% remaining) ${used} used`
  );
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
  const buttons: (Element | null)[] = [
    ui.checkSiteButton,
    ui.checkSiteAuthButton,
    ui.signInButton,
    ui.runAgainButton,
    ui.exportButton,
    ui.viewDetailsButton,
    ui.changePlanButton,
    ui.manageTeamButton,
    ui.scheduleSelect,
    ui.orgSelect,
    ui.webflowPublishToggle,
  ];

  for (const control of buttons) {
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
    startJobStatusPolling();
  } catch (error) {
    state.currentJob = null;
    renderJobState(null);
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
  const siteSetting = await findConnectedWebflowSite();
  if (!siteSetting) {
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

  await apiRequest<WebflowSiteSetting>(
    `/v1/integrations/webflow/sites/${siteSetting.webflow_site_id}/auto-publish`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

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

  const response = await fetch(
    `${state.apiBaseUrl}/v1/jobs/${state.currentJob.id}/export`,
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
  anchor.download = `${state.currentJob.id}-adapt-export.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleAuthError(error: unknown): void {
  if (typeof error === "object" && error !== null && "status" in error) {
    const apiError = error as ApiError;
    if (apiError.status === 401) {
      setStoredToken(null);
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
      renderJobState(null);
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
      startJobStatusPolling();
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
  if (!ui.checkSiteButton) {
    return;
  }

  ui.checkSiteButton.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  ui.signInButton?.addEventListener("click", async () => {
    await connectAccount();
    await refreshDashboard();
  });

  ui.runAgainButton?.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  ui.checkSiteAuthButton?.addEventListener("click", async () => {
    try {
      await runScanForCurrentSite();
    } catch (error) {
      await handleAuthError(error);
    }
  });

  ui.exportButton?.addEventListener("click", async () => {
    try {
      await exportCurrentJob();
    } catch (error) {
      setStatus(
        "Export failed",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  });

  ui.viewDetailsButton?.addEventListener("click", () => {
    const detailPath = state.currentJob?.id
      ? `${APP_ROUTES.viewJob}/${encodeURIComponent(state.currentJob.id)}`
      : APP_ROUTES.dashboard;
    openSettingsPage(detailPath);
  });

  ui.changePlanButton?.addEventListener("click", () => {
    openSettingsPage(APP_ROUTES.changePlan);
  });

  ui.manageTeamButton?.addEventListener("click", () => {
    openSettingsPage(APP_ROUTES.manageTeam);
  });

  ui.orgSelect?.addEventListener("change", () => {
    void switchOrganisation();
  });

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
}

async function initialise(): Promise<void> {
  window.addEventListener("beforeunload", stopJobStatusPolling);
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
