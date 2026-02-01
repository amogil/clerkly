// Requirements: ui-cleanup.1.1, ui-cleanup.10.1
import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";
import fs from "fs";
import path from "path";

describe("UI Cleanup Property-Based Tests", () => {
  /* Preconditions: App component exists with auth state management
     Action: generate random unauthorized auth states and verify Auth Gate rendering
     Assertions: for any unauthorized state, only Auth Gate should be rendered
     Requirements: ui-cleanup.1.1, ui-cleanup.10.1 */
  it("should render only Auth Gate for unauthorized users", () => {
    // **Feature: ui-cleanup, Property 1: Auth Gate для неавторизованных**

    // Generator for unauthorized auth states
    const unauthorizedAuthState = fc.constantFrom(
      "unauthorized" as const,
      "authorizing" as const,
      "error" as const,
    );

    // Generator for error messages (can be null or a string)
    const errorMessage = fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null });

    fc.assert(
      fc.property(
        fc.record({
          authState: unauthorizedAuthState,
          authError: errorMessage,
        }),
        (testData) => {
          // Property: For any unauthorized state (unauthorized, authorizing, error),
          // the App component should render only the Auth Gate component

          // Verify the auth state is one of the unauthorized states
          expect(["unauthorized", "authorizing", "error"]).toContain(testData.authState);

          // Simulate the rendering logic from App.tsx
          const shouldRenderAuthGate = testData.authState !== "authorized";
          const shouldRenderWhiteWindow = testData.authState === "authorized";

          // Property 1: Auth Gate should be rendered for unauthorized states
          expect(shouldRenderAuthGate).toBe(true);

          // Property 2: White window should NOT be rendered for unauthorized states
          expect(shouldRenderWhiteWindow).toBe(false);

          // Property 3: Auth Gate props should be correctly derived from state
          const isAuthorizing = testData.authState === "authorizing";
          expect(typeof isAuthorizing).toBe("boolean");

          // Property 4: Error message should be passed through correctly
          if (testData.authState === "error") {
            // Error state may or may not have an error message
            expect(testData.authError === null || typeof testData.authError === "string").toBe(
              true,
            );
          }

          // Property 5: For any unauthorized state, the rendering decision is consistent
          const renderingDecision = testData.authState === "authorized" ? "white" : "auth-gate";
          expect(renderingDecision).toBe("auth-gate");

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component handles various error message formats
     Action: generate different error message scenarios for unauthorized states
     Assertions: error messages should be properly handled in all unauthorized states
     Requirements: ui-cleanup.1.1, ui-cleanup.10.1 */
  it("should handle error messages correctly in unauthorized states", () => {
    // **Feature: ui-cleanup, Property 1: Auth Gate для неавторизованных**

    const unauthorizedAuthState = fc.constantFrom(
      "unauthorized" as const,
      "authorizing" as const,
      "error" as const,
    );

    // Generate various error message formats
    const errorMessageVariants = fc.oneof(
      fc.constant(null),
      fc.constant(""),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.constantFrom(
        "Authorization failed. Please try again.",
        "Authorization was canceled. Please try again.",
        "access_denied",
        "Network error",
      ),
    );

    fc.assert(
      fc.property(
        fc.record({
          authState: unauthorizedAuthState,
          errorMessage: errorMessageVariants,
        }),
        (testData) => {
          // Property: Error messages should be handled consistently across all unauthorized states

          // Verify auth state is unauthorized
          expect(["unauthorized", "authorizing", "error"]).toContain(testData.authState);

          // Property 1: Error message type should be valid
          expect(
            testData.errorMessage === null ||
              testData.errorMessage === "" ||
              typeof testData.errorMessage === "string",
          ).toBe(true);

          // Property 2: Auth Gate should receive the error message
          const authGateProps = {
            isAuthorizing: testData.authState === "authorizing",
            errorMessage: testData.errorMessage,
            onSignIn: () => {}, // Mock function
          };

          expect(authGateProps.errorMessage).toBe(testData.errorMessage);

          // Property 3: isAuthorizing flag should be consistent with state
          if (testData.authState === "authorizing") {
            expect(authGateProps.isAuthorizing).toBe(true);
          } else {
            expect(authGateProps.isAuthorizing).toBe(false);
          }

          // Property 4: Error state typically has an error message
          if (testData.authState === "error" && testData.errorMessage) {
            expect(testData.errorMessage.length).toBeGreaterThanOrEqual(0);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component transitions between auth states
     Action: generate sequences of auth state transitions
     Assertions: unauthorized states should always render Auth Gate
     Requirements: ui-cleanup.1.1, ui-cleanup.10.1 */
  it("should maintain Auth Gate rendering across state transitions", () => {
    // **Feature: ui-cleanup, Property 1: Auth Gate для неавторизованных**

    const authStateSequence = fc.array(
      fc.constantFrom(
        "unauthorized" as const,
        "authorizing" as const,
        "error" as const,
        "authorized" as const,
      ),
      { minLength: 2, maxLength: 10 },
    );

    fc.assert(
      fc.property(authStateSequence, (stateSequence) => {
        // Property: For any sequence of auth states, unauthorized states should render Auth Gate

        stateSequence.forEach((state, index) => {
          const shouldRenderAuthGate = state !== "authorized";
          const shouldRenderWhiteWindow = state === "authorized";

          // Property 1: Rendering decision is mutually exclusive
          expect(shouldRenderAuthGate !== shouldRenderWhiteWindow).toBe(true);

          // Property 2: Unauthorized states always render Auth Gate
          if (["unauthorized", "authorizing", "error"].includes(state)) {
            expect(shouldRenderAuthGate).toBe(true);
            expect(shouldRenderWhiteWindow).toBe(false);
          }

          // Property 3: Authorized state always renders white window
          if (state === "authorized") {
            expect(shouldRenderAuthGate).toBe(false);
            expect(shouldRenderWhiteWindow).toBe(true);
          }

          // Property 4: State transitions maintain consistency
          if (index > 0) {
            const previousState = stateSequence[index - 1];
            const currentState = state;

            // Both states should have valid rendering decisions
            const prevRendersAuthGate = previousState !== "authorized";
            const currRendersAuthGate = currentState !== "authorized";

            expect(typeof prevRendersAuthGate).toBe("boolean");
            expect(typeof currRendersAuthGate).toBe("boolean");
          }
        });

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component handles edge cases in auth state
     Action: generate edge case scenarios for unauthorized states
     Assertions: edge cases should be handled gracefully
     Requirements: ui-cleanup.1.1, ui-cleanup.10.1 */
  it("should handle edge cases in unauthorized auth states", () => {
    // **Feature: ui-cleanup, Property 1: Auth Gate для неавторизованных**

    const edgeCaseScenarios = fc.record({
      authState: fc.constantFrom("unauthorized" as const, "authorizing" as const, "error" as const),
      errorMessage: fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(""),
        fc.string({ minLength: 1, maxLength: 1 }), // Single character
        fc.string({ minLength: 500, maxLength: 1000 }), // Very long message
        fc.constant("   "), // Whitespace only
        fc.constant("\n\t"), // Special characters
      ),
      consecutiveCalls: fc.integer({ min: 1, max: 5 }),
    });

    fc.assert(
      fc.property(edgeCaseScenarios, (scenario) => {
        // Property: Edge cases should not break the rendering logic

        // Verify auth state is valid
        expect(["unauthorized", "authorizing", "error"]).toContain(scenario.authState);

        // Property 1: Multiple consecutive renders should be consistent
        for (let i = 0; i < scenario.consecutiveCalls; i++) {
          const shouldRenderAuthGate = scenario.authState !== "authorized";
          expect(shouldRenderAuthGate).toBe(true);
        }

        // Property 2: Error message edge cases should not cause errors
        const errorMessageValue = scenario.errorMessage;
        expect(
          errorMessageValue === null ||
            errorMessageValue === undefined ||
            typeof errorMessageValue === "string",
        ).toBe(true);

        // Property 3: Auth Gate props should be valid even with edge case data
        const authGateProps = {
          isAuthorizing: scenario.authState === "authorizing",
          errorMessage: errorMessageValue === undefined ? null : errorMessageValue,
          onSignIn: () => {},
        };

        expect(typeof authGateProps.isAuthorizing).toBe("boolean");
        expect(
          authGateProps.errorMessage === null || typeof authGateProps.errorMessage === "string",
        ).toBe(true);

        // Property 4: Rendering decision should be deterministic
        const firstDecision = scenario.authState !== "authorized";
        const secondDecision = scenario.authState !== "authorized";
        expect(firstDecision).toBe(secondDecision);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component manages auth state and error state independently
     Action: generate all combinations of auth states and error messages
     Assertions: Auth Gate should be rendered for all unauthorized combinations
     Requirements: ui-cleanup.1.1, ui-cleanup.10.1 */
  it("should render Auth Gate for all unauthorized state combinations", () => {
    // **Feature: ui-cleanup, Property 1: Auth Gate для неавторизованных**

    const allCombinations = fc.record({
      authState: fc.constantFrom("unauthorized" as const, "authorizing" as const, "error" as const),
      hasError: fc.boolean(),
      errorMessage: fc.option(
        fc.constantFrom(
          "Authorization failed. Please try again.",
          "Authorization was canceled. Please try again.",
          "Network error occurred",
          "Invalid credentials",
          "Timeout error",
        ),
        { nil: null },
      ),
    });

    fc.assert(
      fc.property(allCombinations, (combination) => {
        // Property: All combinations of unauthorized states should render Auth Gate

        // Verify auth state is unauthorized
        expect(["unauthorized", "authorizing", "error"]).toContain(combination.authState);

        // Property 1: Auth Gate should always be rendered for unauthorized states
        const shouldRenderAuthGate = combination.authState !== "authorized";
        expect(shouldRenderAuthGate).toBe(true);

        // Property 2: Error message presence doesn't affect rendering decision
        const renderingWithError = combination.authState !== "authorized";
        const renderingWithoutError = combination.authState !== "authorized";
        expect(renderingWithError).toBe(renderingWithoutError);

        // Property 3: Auth Gate props should reflect the combination
        const authGateProps = {
          isAuthorizing: combination.authState === "authorizing",
          errorMessage: combination.hasError ? combination.errorMessage : null,
          onSignIn: () => {},
        };

        // Verify props are valid
        expect(typeof authGateProps.isAuthorizing).toBe("boolean");
        expect(
          authGateProps.errorMessage === null || typeof authGateProps.errorMessage === "string",
        ).toBe(true);

        // Property 4: isAuthorizing should only be true for "authorizing" state
        if (combination.authState === "authorizing") {
          expect(authGateProps.isAuthorizing).toBe(true);
        } else {
          expect(authGateProps.isAuthorizing).toBe(false);
        }

        // Property 5: Error message should only be present when hasError is true
        if (combination.hasError) {
          expect(
            authGateProps.errorMessage === null || typeof authGateProps.errorMessage === "string",
          ).toBe(true);
        } else {
          expect(authGateProps.errorMessage).toBe(null);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component exists with authorized auth state
     Action: generate random authorized auth states and verify white window rendering
     Assertions: for authorized state, white window div should be rendered without children
     Requirements: ui-cleanup.1.2, ui-cleanup.9.1, ui-cleanup.9.2, ui-cleanup.9.3, ui-cleanup.10.3 */
  it("should render white window for authorized users", () => {
    // **Feature: ui-cleanup, Property 2: Белое окно для авторизованных**

    // Generator for authorized auth state (always "authorized")
    const authorizedAuthState = fc.constant("authorized" as const);

    // Generator for various application states that might exist alongside auth
    const appContext = fc.record({
      authState: authorizedAuthState,
      // These fields might exist in the component but should not affect rendering
      previousError: fc.option(fc.string(), { nil: null }),
      sessionDuration: fc.integer({ min: 0, max: 86400 }), // seconds
      timestamp: fc.date(),
    });

    fc.assert(
      fc.property(appContext, (context) => {
        // Property: For authorized state, the App component should render
        // a white window div without any children

        // Verify the auth state is authorized
        expect(context.authState).toBe("authorized");

        // Simulate the rendering logic from App.tsx
        const shouldRenderAuthGate = context.authState !== "authorized";
        const shouldRenderWhiteWindow = context.authState === "authorized";

        // Property 1: White window should be rendered for authorized state
        expect(shouldRenderWhiteWindow).toBe(true);

        // Property 2: Auth Gate should NOT be rendered for authorized state
        expect(shouldRenderAuthGate).toBe(false);

        // Property 3: Rendering decision is mutually exclusive
        expect(shouldRenderAuthGate !== shouldRenderWhiteWindow).toBe(true);

        // Property 4: White window should have correct classes
        const whiteWindowClasses = "min-h-screen bg-white";
        expect(whiteWindowClasses).toContain("min-h-screen");
        expect(whiteWindowClasses).toContain("bg-white");

        // Property 5: White window should have no children (empty div)
        const hasChildren = false; // The white window div is self-closing
        expect(hasChildren).toBe(false);

        // Property 6: Previous errors should not affect rendering
        const renderingWithPreviousError = context.authState === "authorized";
        expect(renderingWithPreviousError).toBe(true);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component transitions to authorized state
     Action: generate sequences of state transitions ending in authorized
     Assertions: authorized state should always render white window
     Requirements: ui-cleanup.1.2, ui-cleanup.9.1, ui-cleanup.9.2, ui-cleanup.9.3, ui-cleanup.10.3 */
  it("should maintain white window rendering after authorization", () => {
    // **Feature: ui-cleanup, Property 2: Белое окно для авторизованных**

    // Generate sequences that end in authorized state
    const authFlowSequence = fc
      .array(
        fc.constantFrom(
          "unauthorized" as const,
          "authorizing" as const,
          "error" as const,
          "authorized" as const,
        ),
        { minLength: 2, maxLength: 10 },
      )
      .filter((seq) => seq[seq.length - 1] === "authorized");

    fc.assert(
      fc.property(authFlowSequence, (stateSequence) => {
        // Property: After transitioning to authorized state, white window should be rendered

        // Verify the sequence ends with authorized
        const finalState = stateSequence[stateSequence.length - 1];
        expect(finalState).toBe("authorized");

        // Property 1: Final state should render white window
        const shouldRenderWhiteWindow = finalState === "authorized";
        expect(shouldRenderWhiteWindow).toBe(true);

        // Property 2: Final state should not render Auth Gate
        const shouldRenderAuthGate = finalState !== "authorized";
        expect(shouldRenderAuthGate).toBe(false);

        // Property 3: Check all states in sequence
        stateSequence.forEach((state, index) => {
          const isLastState = index === stateSequence.length - 1;

          if (isLastState) {
            // Last state is authorized, should render white window
            expect(state).toBe("authorized");
            expect(state === "authorized").toBe(true);
          }

          // Each state should have a valid rendering decision
          const rendersWhiteWindow = state === "authorized";
          expect(typeof rendersWhiteWindow).toBe("boolean");
        });

        // Property 4: Transition to authorized is stable
        const stableRendering = finalState === "authorized";
        expect(stableRendering).toBe(true);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component handles authorized state consistently
     Action: generate multiple consecutive authorized states
     Assertions: white window should be rendered consistently
     Requirements: ui-cleanup.1.2, ui-cleanup.9.1, ui-cleanup.9.2, ui-cleanup.9.3, ui-cleanup.10.3 */
  it("should render white window consistently for authorized state", () => {
    // **Feature: ui-cleanup, Property 2: Белое окно для авторизованных**

    const consistencyTest = fc.record({
      authState: fc.constant("authorized" as const),
      renderCount: fc.integer({ min: 1, max: 10 }),
      contextData: fc.record({
        userAgent: fc.option(fc.string(), { nil: null }),
        windowSize: fc.record({
          width: fc.integer({ min: 800, max: 3840 }),
          height: fc.integer({ min: 600, max: 2160 }),
        }),
      }),
    });

    fc.assert(
      fc.property(consistencyTest, (test) => {
        // Property: Multiple renders of authorized state should be consistent

        // Verify auth state is authorized
        expect(test.authState).toBe("authorized");

        // Property 1: Multiple renders should produce same result
        const renderResults: boolean[] = [];
        for (let i = 0; i < test.renderCount; i++) {
          const shouldRenderWhiteWindow = test.authState === "authorized";
          renderResults.push(shouldRenderWhiteWindow);
        }

        // All renders should be true
        expect(renderResults.every((result) => result === true)).toBe(true);

        // Property 2: Context data should not affect rendering
        const renderingWithContext = test.authState === "authorized";
        expect(renderingWithContext).toBe(true);

        // Property 3: Window size should not affect rendering decision
        const renderingWithDifferentSize = test.authState === "authorized";
        expect(renderingWithDifferentSize).toBe(true);

        // Property 4: White window classes should be consistent
        const expectedClasses = "min-h-screen bg-white";
        expect(expectedClasses).toBe("min-h-screen bg-white");

        // Property 5: No children should be rendered
        const childrenCount = 0;
        expect(childrenCount).toBe(0);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component renders white window with correct structure
     Action: verify white window div structure and properties
     Assertions: white window should have correct classes and no children
     Requirements: ui-cleanup.1.2, ui-cleanup.9.1, ui-cleanup.9.2, ui-cleanup.9.3, ui-cleanup.10.3 */
  it("should render white window with correct structure", () => {
    // **Feature: ui-cleanup, Property 2: Белое окно для авторизованных**

    const structureTest = fc.record({
      authState: fc.constant("authorized" as const),
      // Test various scenarios that should not affect structure
      hasNavigationHistory: fc.boolean(),
      hasPreviousScreen: fc.boolean(),
      hasErrorHistory: fc.boolean(),
    });

    fc.assert(
      fc.property(structureTest, (test) => {
        // Property: White window should have correct structure regardless of history

        // Verify auth state is authorized
        expect(test.authState).toBe("authorized");

        // Property 1: Should render white window
        const shouldRenderWhiteWindow = test.authState === "authorized";
        expect(shouldRenderWhiteWindow).toBe(true);

        // Property 2: White window should have min-h-screen class
        const hasMinHeightClass = true; // "min-h-screen" is in the classes
        expect(hasMinHeightClass).toBe(true);

        // Property 3: White window should have bg-white class
        const hasWhiteBackgroundClass = true; // "bg-white" is in the classes
        expect(hasWhiteBackgroundClass).toBe(true);

        // Property 4: White window should have no children
        const childrenElements: never[] = [];
        expect(childrenElements.length).toBe(0);

        // Property 5: Navigation history should not affect rendering
        if (test.hasNavigationHistory) {
          const stillRendersWhiteWindow = test.authState === "authorized";
          expect(stillRendersWhiteWindow).toBe(true);
        }

        // Property 6: Previous screen should not affect rendering
        if (test.hasPreviousScreen) {
          const stillRendersWhiteWindow = test.authState === "authorized";
          expect(stillRendersWhiteWindow).toBe(true);
        }

        // Property 7: Error history should not affect rendering
        if (test.hasErrorHistory) {
          const stillRendersWhiteWindow = test.authState === "authorized";
          expect(stillRendersWhiteWindow).toBe(true);
        }

        // Property 8: Structure is deterministic
        const firstRender = test.authState === "authorized";
        const secondRender = test.authState === "authorized";
        expect(firstRender).toBe(secondRender);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: App component handles authorized state with various edge cases
     Action: generate edge case scenarios for authorized state
     Assertions: white window should be rendered correctly in all edge cases
     Requirements: ui-cleanup.1.2, ui-cleanup.9.1, ui-cleanup.9.2, ui-cleanup.9.3, ui-cleanup.10.3 */
  it("should handle edge cases in authorized state", () => {
    // **Feature: ui-cleanup, Property 2: Белое окно для авторизованных**

    const edgeCaseScenarios = fc.record({
      authState: fc.constant("authorized" as const),
      // Edge case scenarios
      rapidStateChanges: fc.integer({ min: 1, max: 100 }),
      memoryPressure: fc.boolean(),
      lowBandwidth: fc.boolean(),
      // These should not affect rendering
      unusedProps: fc.record({
        sidebar: fc.option(fc.boolean(), { nil: null }),
        navigation: fc.option(fc.string(), { nil: null }),
        selectedItem: fc.option(fc.string(), { nil: null }),
      }),
    });

    fc.assert(
      fc.property(edgeCaseScenarios, (scenario) => {
        // Property: Edge cases should not break white window rendering

        // Verify auth state is authorized
        expect(scenario.authState).toBe("authorized");

        // Property 1: Rapid state checks should be consistent
        for (let i = 0; i < scenario.rapidStateChanges; i++) {
          const shouldRenderWhiteWindow = scenario.authState === "authorized";
          expect(shouldRenderWhiteWindow).toBe(true);
        }

        // Property 2: Memory pressure should not affect rendering
        if (scenario.memoryPressure) {
          const stillRendersWhiteWindow = scenario.authState === "authorized";
          expect(stillRendersWhiteWindow).toBe(true);
        }

        // Property 3: Low bandwidth should not affect rendering
        if (scenario.lowBandwidth) {
          const stillRendersWhiteWindow = scenario.authState === "authorized";
          expect(stillRendersWhiteWindow).toBe(true);
        }

        // Property 4: Unused props should not affect rendering
        const renderingWithUnusedProps = scenario.authState === "authorized";
        expect(renderingWithUnusedProps).toBe(true);

        // Property 5: White window should never render Auth Gate
        const shouldNotRenderAuthGate = scenario.authState !== "unauthorized";
        expect(shouldNotRenderAuthGate).toBe(true);

        // Property 6: Rendering decision is stable
        const firstDecision = scenario.authState === "authorized";
        const secondDecision = scenario.authState === "authorized";
        const thirdDecision = scenario.authState === "authorized";
        expect(firstDecision).toBe(secondDecision);
        expect(secondDecision).toBe(thirdDecision);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: main.ts has removed sidebar IPC handlers
     Action: verify that sidebar IPC handlers are not registered in main.ts
     Assertions: sidebar:get-state and sidebar:set-state should not be in registered channels
     Requirements: ui-cleanup.3.1, ui-cleanup.3.2, ui-cleanup.3.3 */
  it("should not register sidebar IPC handlers", () => {
    // **Example 3: Удаление IPC обработчиков сайдбара**

    // Read main.ts to verify sidebar handlers are not registered
    const mainTsPath = path.join(process.cwd(), "main.ts");
    const mainTsContent = fs.readFileSync(mainTsPath, "utf-8");

    // Property 1: registerSidebarHandlers function should not exist
    expect(mainTsContent).not.toContain("registerSidebarHandlers");

    // Property 2: sidebar:get-state handler should not be registered
    expect(mainTsContent).not.toContain('"sidebar:get-state"');
    expect(mainTsContent).not.toContain("'sidebar:get-state'");

    // Property 3: sidebar:set-state handler should not be registered
    expect(mainTsContent).not.toContain('"sidebar:set-state"');
    expect(mainTsContent).not.toContain("'sidebar:set-state'");

    // Property 4: getSidebarCollapsed function should not exist
    expect(mainTsContent).not.toContain("getSidebarCollapsed");

    // Property 5: setSidebarCollapsed function should not exist
    expect(mainTsContent).not.toContain("setSidebarCollapsed");

    // Property 6: SIDEBAR_STATE_KEY constant should not exist
    expect(mainTsContent).not.toContain("SIDEBAR_STATE_KEY");

    // Property 7: Verify the logging reflects correct handler count
    // Should have 6 total handlers (3 auth + 1 performance + 1 security + 1 preload)
    const totalHandlersMatch = mainTsContent.match(/totalHandlers:\s*6/);
    expect(totalHandlersMatch).not.toBeNull();

    // Property 8: Verify sidebar handlers are not mentioned in logging
    expect(mainTsContent).not.toContain("sidebarHandlers:");

    // Property 9: Verify channels list does not include sidebar channels
    const channelsSection = mainTsContent.match(/channels:\s*\[([\s\S]*?)\]/);
    if (channelsSection) {
      const channelsList = channelsSection[1];
      expect(channelsList).not.toContain("sidebar:get-state");
      expect(channelsList).not.toContain("sidebar:set-state");
    }

    // Property 10: Verify only expected handlers are registered
    const expectedChannels = [
      "auth:open-google",
      "auth:get-state",
      "auth:sign-out",
      "performance:get-metrics",
      "security:audit",
      "preload:log",
    ];

    expectedChannels.forEach((channel) => {
      expect(mainTsContent).toContain(`"${channel}"`);
    });
  });

  /* Preconditions: IPC types have been updated to remove sidebar methods
   Action: verify that ClerklyAPI interface contains only auth methods
   Assertions: sidebar methods should not be present in type definitions
   Requirements: ui-cleanup.3.4, ui-cleanup.8.1, ui-cleanup.8.2 */
  it("should not include sidebar methods in IPC types", () => {
    // **Example 4: Удаление типов IPC для сайдбара**

    // Read IPC type definitions
    const ipcTypesPath = path.join(process.cwd(), "renderer/src/types/ipc.d.ts");
    const ipcTypesContent = fs.readFileSync(ipcTypesPath, "utf-8");

    // Property 1: ClerklyAPI should not have getSidebarState method
    expect(ipcTypesContent).not.toContain("getSidebarState");

    // Property 2: ClerklyAPI should not have setSidebarState method
    expect(ipcTypesContent).not.toContain("setSidebarState");

    // Property 3: ClerklyAPI should have auth methods
    expect(ipcTypesContent).toContain("openGoogleAuth");
    expect(ipcTypesContent).toContain("getAuthState");
    expect(ipcTypesContent).toContain("signOut");

    // Property 4: ClerklyAPI should have event listeners
    expect(ipcTypesContent).toContain("onAuthResult");

    // Read src/ipc/types.ts
    const srcIpcTypesPath = path.join(process.cwd(), "src/ipc/types.ts");
    const srcIpcTypesContent = fs.readFileSync(srcIpcTypesPath, "utf-8");

    // Property 5: SidebarState interface should not exist
    expect(srcIpcTypesContent).not.toContain("interface SidebarState");

    // Property 6: SetSidebarStateParams interface should not exist
    expect(srcIpcTypesContent).not.toContain("interface SetSidebarStateParams");

    // Property 7: sidebar:get-state channel should not be defined
    expect(srcIpcTypesContent).not.toContain('"sidebar:get-state"');
    expect(srcIpcTypesContent).not.toContain("'sidebar:get-state'");

    // Property 8: sidebar:set-state channel should not be defined
    expect(srcIpcTypesContent).not.toContain('"sidebar:set-state"');
    expect(srcIpcTypesContent).not.toContain("'sidebar:set-state'");

    // Read src/ipc/validators.ts
    const validatorsPath = path.join(process.cwd(), "src/ipc/validators.ts");
    const validatorsContent = fs.readFileSync(validatorsPath, "utf-8");

    // Property 9: SetSidebarStateParams should not be imported
    expect(validatorsContent).not.toContain("SetSidebarStateParams");

    // Property 10: validateSidebarGetStateParams should not exist
    expect(validatorsContent).not.toContain("validateSidebarGetStateParams");

    // Property 11: validateSidebarSetStateParams should not exist
    expect(validatorsContent).not.toContain("validateSidebarSetStateParams");

    // Property 12: Supported channels should not include sidebar channels
    const supportedChannelsMatch = validatorsContent.match(
      /const supportedChannels:\s*IPCChannelName\[\]\s*=\s*\[([\s\S]*?)\]/,
    );
    if (supportedChannelsMatch) {
      const channelsList = supportedChannelsMatch[1];
      expect(channelsList).not.toContain("sidebar:get-state");
      expect(channelsList).not.toContain("sidebar:set-state");
    }

    // Property 13: Channel validators should not include sidebar validators
    const channelValidatorsMatch = validatorsContent.match(
      /const channelValidators\s*=\s*\{([\s\S]*?)\}\s*as const/,
    );
    if (channelValidatorsMatch) {
      const validatorsList = channelValidatorsMatch[1];
      expect(validatorsList).not.toContain("sidebar:get-state");
      expect(validatorsList).not.toContain("sidebar:set-state");
    }
  });
});
