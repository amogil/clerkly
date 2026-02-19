// Types for Test IPC Handlers
// These types ensure type safety when calling test IPC handlers from functional tests

import type { User } from '../main/db/schema';

// Base response type
export interface TestIPCResponse<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

// test:clear-tokens
export type TestClearTokensResponse = TestIPCResponse;

// test:clear-data
export type TestClearDataResponse = TestIPCResponse;

// test:delete-current-user
export type TestDeleteCurrentUserResponse = TestIPCResponse;

// test:trigger-auth-success
export type TestTriggerAuthSuccessResponse = TestIPCResponse;

// test:get-profile
export interface TestGetProfileResponse {
  success: boolean;
  error?: string;
  profile: User | null;
}

// test:get-profile-by-email
export interface TestGetProfileByEmailResponse {
  success: boolean;
  error?: string;
  profile: User | null;
}

// test:create-agent-with-old-message
export interface TestCreateAgentWithOldMessageResponse {
  success: boolean;
  error?: string;
  agentId?: string;
  timestamp?: string;
}

// test:setup-profile
export interface TestSetupProfileInput {
  id?: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
}
export type TestSetupProfileResponse = TestIPCResponse;

// test:save-data
export type TestSaveDataResponse = TestIPCResponse;

// test:load-data
export interface TestLoadDataResponse {
  success: boolean;
  error?: string;
  value?: string;
}

// test:delete-data
export type TestDeleteDataResponse = TestIPCResponse;

// test:handle-deep-link
export interface TestHandleDeepLinkResponse {
  authorized: boolean;
  error?: string;
}

// test:trigger-error-notification
export type TestTriggerErrorNotificationResponse = TestIPCResponse;

// test:expire-token
export type TestExpireTokenResponse = TestIPCResponse;

// test:get-tokens
export interface TestGetTokensResponse {
  success: boolean;
  error?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

// test:simulate-data-error
export type TestSimulateDataErrorResponse = TestIPCResponse;

// test:clear-data-errors
export type TestClearDataErrorsResponse = TestIPCResponse;

// test:create-agent-message
export type TestCreateAgentMessageResponse = TestIPCResponse;

// Unified type map for all test IPC handlers
export interface TestIPCHandlers {
  'test:clear-tokens': () => Promise<TestClearTokensResponse>;
  'test:clear-data': () => Promise<TestClearDataResponse>;
  'test:delete-current-user': () => Promise<TestDeleteCurrentUserResponse>;
  'test:trigger-auth-success': () => Promise<TestTriggerAuthSuccessResponse>;
  'test:get-profile': () => Promise<TestGetProfileResponse>;
  'test:get-profile-by-email': (email: string) => Promise<TestGetProfileByEmailResponse>;
  'test:create-agent-with-old-message': (
    minutesAgo: number
  ) => Promise<TestCreateAgentWithOldMessageResponse>;
  'test:setup-profile': (profileData: TestSetupProfileInput) => Promise<TestSetupProfileResponse>;
  'test:save-data': (key: string, value: string) => Promise<TestSaveDataResponse>;
  'test:load-data': (key: string) => Promise<TestLoadDataResponse>;
  'test:delete-data': (key: string) => Promise<TestDeleteDataResponse>;
  'test:handle-deep-link': (url: string) => Promise<TestHandleDeepLinkResponse>;
  'test:trigger-error-notification': (data: {
    message: string;
    context: string;
  }) => Promise<TestTriggerErrorNotificationResponse>;
  'test:expire-token': () => Promise<TestExpireTokenResponse>;
  'test:get-tokens': () => Promise<TestGetTokensResponse>;
  'test:simulate-data-error': (
    operation: 'saveData' | 'loadData' | 'deleteData',
    errorMessage: string
  ) => Promise<TestSimulateDataErrorResponse>;
  'test:clear-data-errors': () => Promise<TestClearDataErrorsResponse>;
  'test:create-agent-message': (
    agentId: string,
    text: string
  ) => Promise<TestCreateAgentMessageResponse>;
}

// Helper type for invoking test IPC handlers with type safety
export type TestIPCInvoke = <K extends keyof TestIPCHandlers>(
  channel: K,
  ...args: Parameters<TestIPCHandlers[K]>
) => ReturnType<TestIPCHandlers[K]>;
