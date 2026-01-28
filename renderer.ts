// Renderer entry: keep minimal for now. Requirements: E.G.5, E.G.10, E.G.11
// UI reference: docs/development/ui_reference (Requirement: E.G.12)
console.log("Renderer is running.");

type ScreenConfig = {
  title: string;
  subtitle: string;
};

const screens: Record<string, ScreenConfig> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Today is Thursday, January 29, 2026",
  },
  calendar: {
    title: "Calendar",
    subtitle: "Upcoming meetings and availability overview",
  },
  tasks: {
    title: "Tasks",
    subtitle: "Action items generated from recent meetings",
  },
  contacts: {
    title: "Contacts",
    subtitle: "People and teams connected to your meetings",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage preferences and integrations",
  },
};

const updateActiveScreen = (screen: string): void => {
  const title = document.getElementById("screen-title");
  const subtitle = document.getElementById("screen-subtitle");
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-screen]");

  buttons.forEach((button) => {
    const isActive = button.dataset.screen === screen;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  const config = screens[screen] ?? screens.dashboard;
  if (title) {
    title.textContent = config.title;
  }
  if (subtitle) {
    subtitle.textContent = config.subtitle;
  }
};

const initNavigation = (): void => {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-screen]");
  if (buttons.length === 0) {
    return;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.dataset.screen) {
        return;
      }
      updateActiveScreen(button.dataset.screen);
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  updateActiveScreen("dashboard");
  initNavigation();
});

export {};
