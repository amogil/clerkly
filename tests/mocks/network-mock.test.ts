// Requirements: testing-infrastructure.2.2
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NetworkMock, MockResponse, HttpMethod, NetworkRequest } from "./network-mock";
import { mockSystem } from "./index";

describe("NetworkMock", () => {
  let networkMock: NetworkMock;
  let originalFetch: any;

  beforeEach(() => {
    networkMock = mockSystem.mockNetwork();
    networkMock.reset();
    // Store original fetch if it exists
    originalFetch = global.fetch;
  });

  afterEach(() => {
    networkMock.reset();
    // Restore original fetch
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  describe("Basic HTTP Methods", () => {
    /* Preconditions: fresh NetworkMock instance with no interceptors
       Action: perform GET request to test URL
       Assertions: returns default response with status 200
       Requirements: testing-infrastructure.2.2 */
    it("should handle GET requests with default response", async () => {
      const response = await networkMock.get("https://api.example.com/users");

      expect(response).toEqual({
        status: 200,
        data: {},
        headers: {},
      });
    });

    /* Preconditions: fresh NetworkMock instance with no interceptors
       Action: perform POST request with data to test URL
       Assertions: returns default response with status 200
       Requirements: testing-infrastructure.2.2 */
    it("should handle POST requests with default response", async () => {
      const testData = { name: "John", email: "john@example.com" };
      const response = await networkMock.post("https://api.example.com/users", testData);

      expect(response).toEqual({
        status: 200,
        data: {},
        headers: {},
      });
    });

    /* Preconditions: fresh NetworkMock instance with no interceptors
       Action: perform PUT request with data to test URL
       Assertions: returns default response with status 200
       Requirements: testing-infrastructure.2.2 */
    it("should handle PUT requests with default response", async () => {
      const testData = { id: 1, name: "John Updated" };
      const response = await networkMock.put("https://api.example.com/users/1", testData);

      expect(response).toEqual({
        status: 200,
        data: {},
        headers: {},
      });
    });

    /* Preconditions: fresh NetworkMock instance with no interceptors
       Action: perform DELETE request to test URL
       Assertions: returns default response with status 200
       Requirements: testing-infrastructure.2.2 */
    it("should handle DELETE requests with default response", async () => {
      const response = await networkMock.delete("https://api.example.com/users/1");

      expect(response).toEqual({
        status: 200,
        data: {},
        headers: {},
      });
    });

    /* Preconditions: fresh NetworkMock instance with no interceptors
       Action: perform PATCH request with data to test URL
       Assertions: returns default response with status 200
       Requirements: testing-infrastructure.2.2 */
    it("should handle PATCH requests with default response", async () => {
      const testData = { name: "John Patched" };
      const response = await networkMock.patch("https://api.example.com/users/1", testData);

      expect(response).toEqual({
        status: 200,
        data: {},
        headers: {},
      });
    });
  });

  describe("Request Interception", () => {
    /* Preconditions: NetworkMock with interceptor configured for specific URL pattern
       Action: perform GET request matching the intercepted pattern
       Assertions: returns custom response from interceptor handler
       Requirements: testing-infrastructure.2.2 */
    it("should intercept requests matching pattern", async () => {
      const customResponse: MockResponse = {
        status: 201,
        data: { id: 1, name: "Created User" },
        headers: { "Content-Type": "application/json" },
      };

      networkMock.intercept("api.example.com", () => customResponse);

      const response = await networkMock.get("https://api.example.com/users");
      expect(response).toEqual(customResponse);
    });

    /* Preconditions: NetworkMock with method-specific interceptor for POST requests
       Action: perform POST and GET requests to same URL pattern
       Assertions: only POST request is intercepted, GET returns default response
       Requirements: testing-infrastructure.2.2 */
    it("should intercept requests by specific HTTP method", async () => {
      const postResponse: MockResponse = {
        status: 201,
        data: { id: 1, created: true },
        headers: {},
      };

      networkMock.interceptMethod("POST", "api.example.com", () => postResponse);

      const postResult = await networkMock.post("https://api.example.com/users", { name: "John" });
      const getResult = await networkMock.get("https://api.example.com/users");

      expect(postResult).toEqual(postResponse);
      expect(getResult).toEqual({ status: 200, data: {}, headers: {} });
    });

    /* Preconditions: NetworkMock with one-time interceptor configured
       Action: perform two identical requests to intercepted URL
       Assertions: first request uses interceptor, second uses default response
       Requirements: testing-infrastructure.2.2 */
    it("should handle one-time interceptors", async () => {
      const oneTimeResponse: MockResponse = {
        status: 200,
        data: { message: "One time only" },
        headers: {},
      };

      networkMock.interceptOnce("api.example.com", () => oneTimeResponse);

      const firstResponse = await networkMock.get("https://api.example.com/test");
      const secondResponse = await networkMock.get("https://api.example.com/test");

      expect(firstResponse).toEqual(oneTimeResponse);
      expect(secondResponse).toEqual({ status: 200, data: {}, headers: {} });
    });

    /* Preconditions: NetworkMock with regex pattern interceptor
       Action: perform requests to URLs matching and not matching regex
       Assertions: only matching URLs are intercepted
       Requirements: testing-infrastructure.2.2 */
    it("should support regex patterns for interception", async () => {
      const regexResponse: MockResponse = {
        status: 200,
        data: { matched: true },
        headers: {},
      };

      // Create a mock that accepts regex patterns
      const regexPattern = /\/api\/v\d+\/users/;
      networkMock.intercept(regexPattern as any, () => regexResponse);

      // This should match the regex
      const matchingResponse = await networkMock.get("https://example.com/api/v1/users");
      // This should not match
      const nonMatchingResponse = await networkMock.get("https://example.com/api/users");

      expect(matchingResponse).toEqual(regexResponse);
      expect(nonMatchingResponse).toEqual({ status: 200, data: {}, headers: {} });
    });
  });

  describe("Request History and Tracking", () => {
    /* Preconditions: fresh NetworkMock instance with no request history
       Action: perform multiple HTTP requests with different methods and URLs
       Assertions: all requests are recorded in history with correct details
       Requirements: testing-infrastructure.2.2 */
    it("should track request history", async () => {
      await networkMock.get("https://api.example.com/users");
      await networkMock.post("https://api.example.com/users", { name: "John" });
      await networkMock.put("https://api.example.com/users/1", { name: "John Updated" });

      const history = networkMock.getRequestHistory();

      expect(history).toHaveLength(3);
      expect(history[0]).toMatchObject({
        url: "https://api.example.com/users",
        method: "GET",
        headers: {},
      });
      expect(history[1]).toMatchObject({
        url: "https://api.example.com/users",
        method: "POST",
        body: { name: "John" },
      });
      expect(history[2]).toMatchObject({
        url: "https://api.example.com/users/1",
        method: "PUT",
        body: { name: "John Updated" },
      });
    });

    /* Preconditions: NetworkMock with multiple requests to different URLs
       Action: get requests matching specific URL pattern
       Assertions: returns only requests matching the pattern
       Requirements: testing-infrastructure.2.2 */
    it("should filter requests by pattern", async () => {
      await networkMock.get("https://api.example.com/users");
      await networkMock.get("https://api.example.com/posts");
      await networkMock.get("https://other.example.com/users");

      const userRequests = networkMock.getRequestsMatching("users");
      const apiRequests = networkMock.getRequestsMatching("api.example.com");

      expect(userRequests).toHaveLength(2);
      expect(apiRequests).toHaveLength(2);
      expect(userRequests.every((req) => req.url.includes("users"))).toBe(true);
      expect(apiRequests.every((req) => req.url.includes("api.example.com"))).toBe(true);
    });

    /* Preconditions: NetworkMock with existing request history
       Action: clear request history
       Assertions: history is empty after clearing
       Requirements: testing-infrastructure.2.2 */
    it("should clear request history", async () => {
      await networkMock.get("https://api.example.com/users");
      await networkMock.post("https://api.example.com/users", { name: "John" });

      expect(networkMock.getRequestHistory()).toHaveLength(2);

      networkMock.clearHistory();

      expect(networkMock.getRequestHistory()).toHaveLength(0);
    });
  });

  describe("Error Simulation", () => {
    /* Preconditions: NetworkMock with network error simulation for specific pattern
       Action: perform request to URL matching error pattern
       Assertions: request throws the simulated error
       Requirements: testing-infrastructure.2.2 */
    it("should simulate network errors", async () => {
      const networkError = new Error("Network connection failed");
      networkMock.simulateNetworkError("api.example.com", networkError);

      await expect(networkMock.get("https://api.example.com/users")).rejects.toThrow(
        "Network connection failed",
      );
    });

    /* Preconditions: NetworkMock with timeout simulation for specific pattern
       Action: perform request to URL matching timeout pattern
       Assertions: request throws timeout error after specified time
       Requirements: testing-infrastructure.2.2 */
    it("should simulate request timeouts", async () => {
      networkMock.simulateTimeout("api.example.com", 100);

      const startTime = Date.now();
      await expect(networkMock.get("https://api.example.com/users")).rejects.toThrow(
        "Request timeout after 100ms",
      );
      const endTime = Date.now();

      // Should take at least the timeout duration
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    /* Preconditions: NetworkMock with error simulation and normal interceptor
       Action: perform requests to error URL and normal URL
       Assertions: error URL throws error, normal URL returns response
       Requirements: testing-infrastructure.2.2 */
    it("should isolate errors to specific patterns", async () => {
      const networkError = new Error("Service unavailable");
      networkMock.simulateNetworkError("api.example.com/error", networkError);
      networkMock.intercept("api.example.com/success", () => ({
        status: 200,
        data: { success: true },
        headers: {},
      }));

      await expect(networkMock.get("https://api.example.com/error")).rejects.toThrow(
        "Service unavailable",
      );

      const successResponse = await networkMock.get("https://api.example.com/success");
      expect(successResponse.data).toEqual({ success: true });
    });
  });

  describe("Configuration and Customization", () => {
    /* Preconditions: NetworkMock with custom default response configured
       Action: perform request to unintercepted URL
       Assertions: returns custom default response instead of built-in default
       Requirements: testing-infrastructure.2.2 */
    it("should allow custom default responses", async () => {
      const customDefault: MockResponse = {
        status: 404,
        data: { error: "Not Found" },
        headers: { "Content-Type": "application/json" },
      };

      networkMock.setDefaultResponse(customDefault);

      const response = await networkMock.get("https://unintercepted.example.com/test");
      expect(response).toEqual(customDefault);
    });

    /* Preconditions: NetworkMock with multiple interceptors and request history
       Action: reset the network mock
       Assertions: all interceptors removed, history cleared, default response restored
       Requirements: testing-infrastructure.2.2 */
    it("should reset all state when reset is called", async () => {
      // Set up some state
      networkMock.intercept("api.example.com", () => ({ status: 200, data: {}, headers: {} }));
      networkMock.setDefaultResponse({ status: 500, data: {}, headers: {} });
      await networkMock.get("https://api.example.com/test");

      expect(networkMock.getRequestHistory()).toHaveLength(1);

      // Reset everything
      networkMock.reset();

      // Verify reset
      expect(networkMock.getRequestHistory()).toHaveLength(0);
      const response = await networkMock.get("https://api.example.com/test");
      expect(response).toEqual({ status: 200, data: {}, headers: {} }); // Default response
    });
  });

  describe("Global Fetch Interception", () => {
    /* Preconditions: NetworkMock with global fetch interception enabled
       Action: use global fetch function with intercepted URL
       Assertions: fetch call is intercepted and returns mock response
       Requirements: testing-infrastructure.2.2 */
    it("should intercept global fetch calls", async () => {
      const mockResponse: MockResponse = {
        status: 200,
        data: { message: "Intercepted fetch" },
        headers: { "Content-Type": "application/json" },
      };

      networkMock.intercept("api.example.com", () => mockResponse);

      // Simulate global fetch call
      if (global.fetch) {
        const response = await global.fetch("https://api.example.com/test");
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData).toEqual({ message: "Intercepted fetch" });
      }
    });

    /* Preconditions: NetworkMock with fetch interception and request tracking
       Action: make fetch call and check request history
       Assertions: fetch call is recorded in request history
       Requirements: testing-infrastructure.2.2 */
    it("should track global fetch calls in history", async () => {
      networkMock.intercept("api.example.com", () => ({
        status: 200,
        data: {},
        headers: {},
      }));

      if (global.fetch) {
        await global.fetch("https://api.example.com/tracked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: "data" }),
        });

        const history = networkMock.getRequestHistory();
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          url: "https://api.example.com/tracked",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      }
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    /* Preconditions: NetworkMock with interceptor returning async response
       Action: perform request to intercepted URL
       Assertions: async response is properly awaited and returned
       Requirements: testing-infrastructure.2.2 */
    it("should handle async interceptor handlers", async () => {
      const asyncResponse: MockResponse = {
        status: 200,
        data: { async: true },
        headers: {},
      };

      networkMock.intercept("api.example.com", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return asyncResponse;
      });

      const response = await networkMock.get("https://api.example.com/async");
      expect(response).toEqual(asyncResponse);
    });

    /* Preconditions: NetworkMock with empty URL pattern interceptor
       Action: perform request with empty string URL
       Assertions: handles empty URL gracefully without errors
       Requirements: testing-infrastructure.2.2 */
    it("should handle empty URLs gracefully", async () => {
      const response = await networkMock.get("");
      expect(response).toEqual({ status: 200, data: {}, headers: {} });
    });

    /* Preconditions: NetworkMock with interceptor for null/undefined data
       Action: perform POST request with null and undefined data
       Assertions: handles null/undefined data without errors
       Requirements: testing-infrastructure.2.2 */
    it("should handle null and undefined request data", async () => {
      const nullResponse = await networkMock.post("https://api.example.com/null", null);
      const undefinedResponse = await networkMock.post(
        "https://api.example.com/undefined",
        undefined,
      );

      expect(nullResponse).toEqual({ status: 200, data: {}, headers: {} });
      expect(undefinedResponse).toEqual({ status: 200, data: {}, headers: {} });
    });

    /* Preconditions: NetworkMock with very long URL pattern
       Action: perform request with extremely long URL
       Assertions: handles long URLs without performance issues or errors
       Requirements: testing-infrastructure.2.2 */
    it("should handle very long URLs", async () => {
      const longUrl = "https://api.example.com/" + "a".repeat(10000);
      const response = await networkMock.get(longUrl);

      expect(response).toEqual({ status: 200, data: {}, headers: {} });
      expect(networkMock.getRequestHistory()).toHaveLength(1);
      expect(networkMock.getRequestHistory()[0].url).toBe(longUrl);
    });

    /* Preconditions: NetworkMock with multiple overlapping interceptors
       Action: perform request matching multiple patterns
       Assertions: first matching interceptor is used
       Requirements: testing-infrastructure.2.2 */
    it("should use first matching interceptor when multiple patterns match", async () => {
      const firstResponse: MockResponse = { status: 200, data: { first: true }, headers: {} };
      const secondResponse: MockResponse = { status: 200, data: { second: true }, headers: {} };

      networkMock.intercept("example.com", () => firstResponse);
      networkMock.intercept("api.example.com", () => secondResponse);

      const response = await networkMock.get("https://api.example.com/test");
      expect(response).toEqual(firstResponse);
    });
  });
});
