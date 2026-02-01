// Requirements: platform-foundation.3.3, platform-foundation.3.4
// IPC Message Validation

import type { IPCChannelName, IPCChannelParams, SetSidebarStateParams } from "./types";

/**
 * Validation error class for IPC parameter validation
 */
export class IPCValidationError extends Error {
  constructor(channel: string, message: string) {
    super(`IPC validation error for channel "${channel}": ${message}`);
    this.name = "IPCValidationError";
  }
}

/**
 * Validates that a value is not null or undefined
 */
const isNotNullish = (value: unknown): boolean => {
  return value !== null && value !== undefined;
};

/**
 * Validates that a value is a boolean
 */
const isBoolean = (value: unknown): value is boolean => {
  return typeof value === "boolean";
};

/**
 * Validates that a value is an object (not null, not array)
 */
const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Validates that a string doesn't contain potential injection patterns
 */
const validateNoInjection = (value: string, fieldName: string): void => {
  // Check for common injection patterns
  const injectionPatterns = [
    /<script/i, // Script injection
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Event handlers
    /eval\s*\(/i, // Eval calls
    /function\s*\(/i, // Function declarations
    /\$\{.*\}/, // Template literals
    /`.*`/, // Backticks
    /__proto__/i, // Prototype pollution
    /constructor/i, // Constructor access
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(value)) {
      throw new IPCValidationError(
        "injection-protection",
        `Potential injection attack detected in ${fieldName}: ${pattern.source}`,
      );
    }
  }

  // Check for excessive length (potential DoS)
  if (value.length > 10000) {
    throw new IPCValidationError(
      "injection-protection",
      `Value too long in ${fieldName}: ${value.length} characters (max 10000)`,
    );
  }
};

/**
 * Sanitizes and validates object properties recursively
 */
const validateObjectSafety = (obj: Record<string, unknown>, path = ""): void => {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Validate key names
    if (typeof key === "string") {
      validateNoInjection(key, `property name ${currentPath}`);
    }

    // Validate string values
    if (typeof value === "string") {
      validateNoInjection(value, currentPath);
    }

    // Recursively validate nested objects
    if (isObject(value)) {
      validateObjectSafety(value, currentPath);
    }

    // Validate arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "string") {
          validateNoInjection(item, `${currentPath}[${index}]`);
        } else if (isObject(item)) {
          validateObjectSafety(item, `${currentPath}[${index}]`);
        }
      });
    }
  }
};

/**
 * Validates parameters for the auth:open-google channel
 * This channel expects no parameters (void)
 */
const validateAuthOpenGoogleParams = (params: unknown): void => {
  // auth:open-google expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "auth:open-google",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Validates parameters for the auth:get-state channel
 * This channel expects no parameters (void)
 */
const validateAuthGetStateParams = (params: unknown): void => {
  // auth:get-state expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "auth:get-state",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Validates parameters for the auth:sign-out channel
 * This channel expects no parameters (void)
 */
const validateAuthSignOutParams = (params: unknown): void => {
  // auth:sign-out expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "auth:sign-out",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Validates parameters for the sidebar:get-state channel
 * This channel expects no parameters (void)
 */
const validateSidebarGetStateParams = (params: unknown): void => {
  // sidebar:get-state expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "sidebar:get-state",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Validates parameters for the sidebar:set-state channel
 * This channel expects SetSidebarStateParams: { collapsed: boolean }
 */
const validateSidebarSetStateParams = (
  params: unknown,
): asserts params is SetSidebarStateParams => {
  if (!isObject(params)) {
    throw new IPCValidationError(
      "sidebar:set-state",
      "Expected object with 'collapsed' property, but received: " + typeof params,
    );
  }

  // Validate against injection attacks
  validateObjectSafety(params, "sidebar:set-state");

  if (!("collapsed" in params)) {
    throw new IPCValidationError("sidebar:set-state", "Missing required property 'collapsed'");
  }

  if (!isBoolean(params.collapsed)) {
    throw new IPCValidationError(
      "sidebar:set-state",
      "Property 'collapsed' must be a boolean, but received: " + typeof params.collapsed,
    );
  }
};

/**
 * Validates parameters for the performance:get-metrics channel
 * This channel expects no parameters (void)
 */
const validatePerformanceGetMetricsParams = (params: unknown): void => {
  // performance:get-metrics expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "performance:get-metrics",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Validates parameters for the security:audit channel
 * This channel expects no parameters (void)
 */
const validateSecurityAuditParams = (params: unknown): void => {
  // security:audit expects no parameters
  if (params !== undefined && params !== null) {
    throw new IPCValidationError(
      "security:audit",
      "Expected no parameters, but received: " + typeof params,
    );
  }
};

/**
 * Channel-specific validator mapping
 */
const channelValidators = {
  "auth:open-google": validateAuthOpenGoogleParams,
  "auth:get-state": validateAuthGetStateParams,
  "auth:sign-out": validateAuthSignOutParams,
  "sidebar:get-state": validateSidebarGetStateParams,
  "sidebar:set-state": validateSidebarSetStateParams,
  "performance:get-metrics": validatePerformanceGetMetricsParams,
  "security:audit": validateSecurityAuditParams,
} as const;

/**
 * Validates IPC channel parameters based on channel name
 *
 * @param channel - The IPC channel name
 * @param params - The parameters to validate
 * @throws {IPCValidationError} When validation fails
 */
export function validateIPCParams<T extends IPCChannelName>(
  channel: T,
  params: unknown,
): asserts params is IPCChannelParams<T> {
  const validator = channelValidators[channel];

  if (!validator) {
    throw new IPCValidationError(channel, `No validator found for channel "${channel}"`);
  }

  try {
    validator(params);
  } catch (error) {
    if (error instanceof IPCValidationError) {
      throw error;
    }

    // Re-throw unexpected errors as validation errors
    throw new IPCValidationError(
      channel,
      `Unexpected validation error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Validates that a channel name is supported
 *
 * @param channel - The channel name to validate
 * @throws {IPCValidationError} When channel is not supported
 */
export function validateChannelName(channel: unknown): asserts channel is IPCChannelName {
  if (typeof channel !== "string") {
    throw new IPCValidationError(
      String(channel),
      "Channel name must be a string, but received: " + typeof channel,
    );
  }

  const supportedChannels: IPCChannelName[] = [
    "auth:open-google",
    "auth:get-state",
    "auth:sign-out",
    "sidebar:get-state",
    "sidebar:set-state",
    "performance:get-metrics",
    "security:audit",
  ];

  if (!supportedChannels.includes(channel as IPCChannelName)) {
    throw new IPCValidationError(
      channel,
      `Unsupported channel "${channel}". Supported channels: ${supportedChannels.join(", ")}`,
    );
  }
}

/**
 * Comprehensive IPC message validation
 * Validates both channel name and parameters
 *
 * @param channel - The IPC channel name
 * @param params - The parameters to validate
 * @throws {IPCValidationError} When validation fails
 */
export function validateIPCMessage<T extends IPCChannelName>(
  channel: unknown,
  params: unknown,
): asserts channel is T {
  // First validate the channel name
  validateChannelName(channel);

  // Then validate the parameters for that channel
  validateIPCParams(channel, params);
}

/**
 * Safe wrapper for IPC validation that returns validation result
 * instead of throwing errors
 *
 * @param channel - The IPC channel name
 * @param params - The parameters to validate
 * @returns Validation result with success flag and optional error message
 */
export function safeValidateIPCMessage(
  channel: unknown,
  params: unknown,
): { success: true } | { success: false; error: string } {
  try {
    validateIPCMessage(channel, params);
    return { success: true };
  } catch (error) {
    if (error instanceof IPCValidationError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
