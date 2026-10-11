/** A value, or a function that reads it when a request is made, e.g. from the environment. */
export type Resolvable = string | (() => string | undefined);

export interface WaitlistClientOptions {
    /** The package routes' prefix, e.g. `https://api.example.com/waitlist`. */
    url: Resolvable;
    /** The project's token. Server-side only: it authorises reading every address on the list. */
    token?: Resolvable | undefined;
    /** Defaults to the global `fetch`. */
    fetch?: typeof fetch | undefined;
    /** Milliseconds before a request counts as unavailable. Defaults to 8000. */
    timeout?: number | undefined;
    /** The header that forwards the visitor's address, as `authentication.client_ip_header` names it. */
    clientIpHeader?: string | undefined;
    /** Called for every unavailable result. Defaults to `console.error`, and `console.warn` for `not-configured`. */
    onUnavailable?: ((failure: UnavailableFailure) => void) | undefined;
    /** Sent with every request, e.g. `X-XSRF-TOKEN`; a function is called per request. */
    headers?:
        | HeadersInit
        | ((operation: Operation) => HeadersInit | undefined)
        | undefined;
    /** Passed to `fetch`: `"include"` sends cookies to an API on another origin. */
    credentials?: RequestCredentials | undefined;
}

export interface RequestOptions {
    /** The visitor the request is made for; sent only when it is an IP address. */
    visitorIp?: string | undefined;
    signal?: AbortSignal | undefined;
    /** Sent with this request on top of the client's `headers`, e.g. a challenge token. */
    headers?: HeadersInit | undefined;
    /**
     * The proof of a bot check, sent in `X-Waitlist-Challenge`, which the API's
     * `SpamProtector` reads. Only `subscribe()` and `requestManageLink({ email })`
     * are checked; an empty proof is not sent.
     */
    challenge?: string | undefined;
}

export type Operation =
    | "purposes"
    | "subscribe"
    | "requestManageLink"
    | "confirmation"
    | "confirm"
    | "unsubscription"
    | "unsubscribe"
    | "manage"
    | "updatePurposes"
    | "leave"
    | "exportData"
    | "erase";

/**
 * `not-configured`: no URL. `timeout`, `aborted`, `network`: no response.
 * `invalid-response`: a body that does not fit. `http-<status>`: a status the call has no answer for.
 */
export type UnavailableReason =
    | "not-configured"
    | "timeout"
    | "aborted"
    | "network"
    | "invalid-response"
    | `http-${number}`;

export interface UnavailableFailure {
    operation: Operation;
    reason: UnavailableReason;
    /** For `network`, the runtime's error code when it reports one, e.g. `ECONNREFUSED` or `ENOTFOUND`. */
    code?: string | undefined;
}

export interface Unavailable {
    status: "unavailable";
    reason: UnavailableReason;
}

export interface RateLimited {
    status: "rate_limited";
    /** Seconds until the next attempt, when the API says. */
    retryAfter: number | null;
}

/** Laravel validation errors, keyed by dotted field path. */
export type ValidationErrors = Record<string, string[]>;

/** `spam_check_failed`: the API's bot check refused the request; the `errors` are empty then. */
export type InvalidReason = "spam_check_failed";

export interface Invalid {
    status: "invalid";
    message: string | null;
    errors: ValidationErrors;
    /** Only when the API names why it refused beyond the fields. */
    reason?: InvalidReason | undefined;
}

export interface NotFound {
    status: "not_found";
}

export interface Expired {
    status: "expired";
}

export type EntryStatus = "pending" | "confirmed" | "unsubscribed";

/** What a token route answers. It never carries the address. */
export interface WaitlistEntry {
    project: string;
    list: string;
    status: EntryStatus;
    /** The purposes in force. */
    purposes: string[];
    confirmedAt: string | null;
    unsubscribedAt: string | null;
    createdAt: string;
}

export interface PurposeWording {
    purpose: string;
    version: string;
    /** Null for a version with one text for every locale. */
    locale: string | null;
    text: string;
    /** SHA-256 of `text`, as lowercase hex. */
    hash: string;
    required: boolean;
}

/**
 * The version shown, or the version with its locale, the hash of the text shown,
 * or the text itself for a project that takes wording from its servers.
 */
export type PurposeChoice =
    | string
    | {
          version: string;
          locale?: string | undefined;
          hash?: string | undefined;
          text?: string | undefined;
      };

export type PurposeChoices = Record<string, PurposeChoice>;

/**
 * The version shown, or the version with its locale and the hash of the text
 * shown. The preference page never takes the text itself.
 */
export type ManagePurposeChoice =
    | string
    | {
          version: string;
          locale?: string | undefined;
          hash?: string | undefined;
          text?: undefined;
      };

export type ManagePurposeChoices = Record<string, ManagePurposeChoice>;

export interface SubscribeInput {
    email: string;
    /** The API's `waitlist.default_list` when left out. */
    list?: string | undefined;
    purposes: PurposeChoices;
    /** Only the fields the project and list define; leave out what is empty, `null` included. */
    metadata?: Record<string, unknown> | undefined;
}

export type ManageLinkInput =
    { token: string } | { email: string; list?: string | undefined };

export type PurposesResult =
    | { status: "ok"; purposes: PurposeWording[] }
    | NotFound
    | RateLimited
    | Unavailable;

export type SubscribeResult =
    { status: "accepted" } | Invalid | RateLimited | Unavailable;

export type ManageLinkResult =
    { status: "requested" } | Invalid | RateLimited | Unavailable;

/**
 * The entry behind a confirm link, which answers only for an open cycle: a
 * person who has left makes it `not_found`, so there is no `unsubscribed`.
 */
export type ConfirmableEntry = WaitlistEntry & {
    status: "pending" | "confirmed";
};

export type ConfirmationResult =
    | { status: "ok"; entry: ConfirmableEntry }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

export type ConfirmResult =
    | { status: "confirmed"; entry: WaitlistEntry }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

export type UnsubscriptionResult =
    | { status: "ok"; entry: WaitlistEntry }
    | NotFound
    | RateLimited
    | Unavailable;

/** `invalid` refuses a malformed purpose, such as an empty one, so only a purpose can get it. */
export type PurposeUnsubscriptionResult = UnsubscriptionResult | Invalid;

export type UnsubscribeResult =
    | { status: "unsubscribed"; entry: WaitlistEntry }
    | NotFound
    | RateLimited
    | Unavailable;

/** `invalid` refuses a malformed purpose, such as an empty one, so only a withdrawal can get it. */
export type WithdrawResult = UnsubscribeResult | Invalid;

export type ManageResult =
    | { status: "ok"; entry: WaitlistEntry }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

/**
 * `not_subscribed`: the address has left. `list_unavailable`: the list was
 * removed since. Null when the API names no reason.
 */
export type ConflictReason = "not_subscribed" | "list_unavailable";

export type UpdatePurposesResult =
    | { status: "updated"; entry: WaitlistEntry }
    | Invalid
    | {
          status: "conflict";
          message: string | null;
          reason: ConflictReason | null;
      }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

export type LeaveResult =
    | { status: "unsubscribed"; entry: WaitlistEntry }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

export type ExportDataResult =
    | { status: "ok"; data: Record<string, unknown> }
    | NotFound
    | Expired
    | RateLimited
    | Unavailable;

export type EraseResult =
    { status: "erased" } | NotFound | Expired | RateLimited | Unavailable;

export interface WaitlistClient {
    /** `GET /purposes`: the current wording for a list's signup form. */
    purposes(
        query?: { list?: string | undefined; locale?: string | undefined },
        options?: RequestOptions,
    ): Promise<PurposesResult>;
    /** `POST /`: answers the same for new and known addresses. */
    subscribe(
        input: SubscribeInput,
        options?: RequestOptions,
    ): Promise<SubscribeResult>;
    /** `POST /manage-link` for an address, `POST /unsubscribe/{token}/manage-link` for the unsubscribe token: answers the same whether or not a mail went out. */
    requestManageLink(
        input: ManageLinkInput,
        options?: RequestOptions,
    ): Promise<ManageLinkResult>;
    /** `GET /confirm/{token}`: the state, without confirming. `ok` also answers for a link that was used before, so check `entry.status`. */
    confirmation(
        token: string,
        options?: RequestOptions,
    ): Promise<ConfirmationResult>;
    /**
     * `POST /confirm/{token}`. A repeat answers `confirmed` again; once the
     * person has left, it is `not_found`.
     */
    confirm(token: string, options?: RequestOptions): Promise<ConfirmResult>;
    /** `GET /unsubscribe/{token}`: the state of an unsubscribe link, without unsubscribing. `ok` also answers when the person has left already, so check `entry.status`. */
    unsubscription(
        token: string,
        options?: RequestOptions & { purpose?: undefined },
    ): Promise<UnsubscriptionResult>;
    /** `GET /unsubscribe/{token}?purpose=`: the state of a link for one purpose; a malformed purpose is refused as for the withdrawal. */
    unsubscription(
        token: string,
        options: RequestOptions & { purpose: string | undefined },
    ): Promise<PurposeUnsubscriptionResult>;
    /** `POST /unsubscribe/{token}`: leaves the list. */
    unsubscribe(
        token: string,
        options?: RequestOptions & { purpose?: undefined },
    ): Promise<UnsubscribeResult>;
    /** `POST /unsubscribe/{token}?purpose=`: withdraws one purpose. */
    unsubscribe(
        token: string,
        options: RequestOptions & { purpose: string | undefined },
    ): Promise<WithdrawResult>;
    /** `GET /manage/{token}`: the entry behind a manage link. */
    manage(token: string, options?: RequestOptions): Promise<ManageResult>;
    /** `PUT /manage/{token}/purposes`: the primary purpose must be among them. */
    updatePurposes(
        token: string,
        purposes: ManagePurposeChoices,
        options?: RequestOptions,
    ): Promise<UpdatePurposesResult>;
    /** `POST /manage/{token}/unsubscribe`: leaves the list from the preference page. */
    leave(token: string, options?: RequestOptions): Promise<LeaveResult>;
    /** `POST /manage/{token}/data`: everything stored for the entry. */
    exportData(
        token: string,
        options?: RequestOptions,
    ): Promise<ExportDataResult>;
    /** `POST /manage/{token}/erase`: erases the entry. */
    erase(token: string, options?: RequestOptions): Promise<EraseResult>;
}
