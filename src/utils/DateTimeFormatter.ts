// Requirements: settings.2.1, settings.2.3, clerkly.3.8

/**
 * DateTimeFormatter utility class for formatting dates and times
 * Uses OS system settings for user-facing dates
 * Uses fixed format (YYYY-MM-DD HH:MM:SS) for logs
 *
 * Requirements: settings.2.1, settings.2.3
 *
 * Note: This utility does NOT use Logger to avoid circular dependency
 * (Logger depends on DateTimeFormatter for timestamp formatting)
 */
export class DateTimeFormatter {
  /**
   * Format date only (no time) using OS system settings
   * Uses toLocaleDateString() without parameters to respect OS date format
   *
   * Requirements: settings.2.1
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted date string
   */
  static formatDate(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

      // Use toLocaleDateString() without parameters to respect OS date format settings
      // This allows macOS users to use custom date format from System Preferences
      return date.toLocaleDateString();
    } catch (error) {
      // Fallback to ISO date on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting date:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toISOString().split('T')[0];
    }
  }

  /**
   * Format date and time using OS system settings
   * Uses toLocaleDateString() and toLocaleTimeString() without parameters
   * to respect OS date/time format
   *
   * Requirements: settings.2.1
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted date and time string
   */
  static formatDateTime(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

      // Use toLocaleDateString() and toLocaleTimeString() without parameters
      // This allows macOS users to use custom date format from System Preferences
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: 'numeric',
      });

      return `${dateStr}, ${timeStr}`;
    } catch (error) {
      // Fallback to toLocaleString on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting date/time:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toLocaleString();
    }
  }

  /**
   * Format timestamp for logs using fixed format YYYY-MM-DD HH:MM:SS±HH:MM
   * Does NOT use system locale - always uses fixed format
   * Includes timezone offset for consistency across different locales
   *
   * Requirements: settings.2.3, clerkly.3.2, clerkly.3.3
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted timestamp string in YYYY-MM-DD HH:MM:SS±HH:MM format
   */
  static formatLogTimestamp(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      // Requirements: clerkly.3.3 - Calculate timezone offset
      // getTimezoneOffset() returns offset in minutes (positive for behind UTC, negative for ahead)
      const timezoneOffsetMinutes = date.getTimezoneOffset();
      const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
      const timezoneOffsetMins = Math.abs(timezoneOffsetMinutes) % 60;
      const timezoneSign = timezoneOffsetMinutes <= 0 ? '+' : '-';
      const timezone = `${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMins).padStart(2, '0')}`;

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${timezone}`;
    } catch (error) {
      // Fallback to ISO string on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting log timestamp:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toISOString();
    }
  }
}
