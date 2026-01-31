// Requirements: platform-foundation.3.3, platform-foundation.3.4
// Unit tests for IPC validators

import { describe, expect, it } from "vitest";
import {
  IPCValidationError,
  validateIPCParams,
  validateChannelName,
  validateIPCMessage,
  safeValidateIPCMessage,
} from "../../src/ipc/validators";

describe("IPC Validators", () => {
  describe("validateChannelName", () => {
    it("should accept valid channel names", () => {
      expect(() => validateChannelName("auth:open-google")).not.toThrow();
      expect(() => validateChannelName("auth:get-state")).not.toThrow();
      expect(() => validateChannelName("auth:sign-out")).not.toThrow();
      expect(() => validateChannelName("sidebar:get-state")).not.toThrow();
      expect(() => validateChannelName("sidebar:set-state")).not.toThrow();
    });

    it("should reject invalid channel names", () => {
      expect(() => validateChannelName("invalid:channel")).toThrow(IPCValidationError);
      expect(() => validateChannelName(123)).toThrow(IPCValidationError);
      expect(() => validateChannelName(null)).toThrow(IPCValidationError);
      expect(() => validateChannelName(undefined)).toThrow(IPCValidationError);
    });
  });

  describe("validateIPCParams", () => {
    it("should accept void parameters for auth channels", () => {
      expect(() => validateIPCParams("auth:open-google", undefined)).not.toThrow();
      expect(() => validateIPCParams("auth:get-state", null)).not.toThrow();
      expect(() => validateIPCParams("auth:sign-out", undefined)).not.toThrow();
    });

    it("should reject non-void parameters for auth channels", () => {
      expect(() => validateIPCParams("auth:open-google", { test: true })).toThrow(
        IPCValidationError,
      );
      expect(() => validateIPCParams("auth:get-state", "invalid")).toThrow(IPCValidationError);
      expect(() => validateIPCParams("auth:sign-out", 123)).toThrow(IPCValidationError);
    });

    it("should accept void parameters for sidebar:get-state", () => {
      expect(() => validateIPCParams("sidebar:get-state", undefined)).not.toThrow();
      expect(() => validateIPCParams("sidebar:get-state", null)).not.toThrow();
    });

    it("should accept valid parameters for sidebar:set-state", () => {
      expect(() => validateIPCParams("sidebar:set-state", { collapsed: true })).not.toThrow();
      expect(() => validateIPCParams("sidebar:set-state", { collapsed: false })).not.toThrow();
    });

    it("should reject invalid parameters for sidebar:set-state", () => {
      expect(() => validateIPCParams("sidebar:set-state", {})).toThrow(IPCValidationError);
      expect(() => validateIPCParams("sidebar:set-state", { collapsed: "true" })).toThrow(
        IPCValidationError,
      );
      expect(() => validateIPCParams("sidebar:set-state", { collapsed: 1 })).toThrow(
        IPCValidationError,
      );
      expect(() => validateIPCParams("sidebar:set-state", null)).toThrow(IPCValidationError);
    });
  });

  describe("validateIPCMessage", () => {
    it("should validate complete IPC messages", () => {
      expect(() => validateIPCMessage("auth:open-google", undefined)).not.toThrow();
      expect(() => validateIPCMessage("sidebar:set-state", { collapsed: true })).not.toThrow();
    });

    it("should reject invalid IPC messages", () => {
      expect(() => validateIPCMessage("invalid:channel", undefined)).toThrow(IPCValidationError);
      expect(() => validateIPCMessage("sidebar:set-state", {})).toThrow(IPCValidationError);
    });
  });

  describe("safeValidateIPCMessage", () => {
    it("should return success for valid messages", () => {
      expect(safeValidateIPCMessage("auth:open-google", undefined)).toEqual({ success: true });
      expect(safeValidateIPCMessage("sidebar:set-state", { collapsed: true })).toEqual({
        success: true,
      });
    });

    it("should return error for invalid messages", () => {
      const result1 = safeValidateIPCMessage("invalid:channel", undefined);
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.error).toContain("Unsupported channel");
      }

      const result2 = safeValidateIPCMessage("sidebar:set-state", {});
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error).toContain("Missing required property");
      }
    });
  });
});
