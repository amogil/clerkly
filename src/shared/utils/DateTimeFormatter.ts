// Requirements: settings.3.1, settings.3.3, clerkly.3.8

/**
 * Shared DateTimeFormatter used across main/renderer/common code.
 *
 * Requirements: settings.3.1, settings.3.3, settings.3.4
 */
export class DateTimeFormatter {
  /**
   * Format date only (no time) using system locale.
   *
   * Requirements: settings.3.1
   */
  static formatDate(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });

      return formatter.format(date);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // DateTimeFormatter intentionally logs directly to avoid Logger cycle.
      console.error(`[DateTimeFormatter] Error formatting date: ${errorMessage}`);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toLocaleDateString();
    }
  }

  /**
   * Format date and time using system locale.
   *
   * Requirements: settings.3.1
   */
  static formatDateTime(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });

      return formatter.format(date);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // DateTimeFormatter intentionally logs directly to avoid Logger cycle.
      console.error(`[DateTimeFormatter] Error formatting date/time: ${errorMessage}`);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toLocaleString();
    }
  }

  /**
   * Format timestamp for logs using fixed format YYYY-MM-DD HH:MM:SS±HH:MM.
   *
   * Requirements: settings.3.3, clerkly.3.2, clerkly.3.3
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

      const timezoneOffsetMinutes = date.getTimezoneOffset();
      const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
      const timezoneOffsetMins = Math.abs(timezoneOffsetMinutes) % 60;
      const timezoneSign = timezoneOffsetMinutes <= 0 ? '+' : '-';
      const timezone = `${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(
        timezoneOffsetMins
      ).padStart(2, '0')}`;

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${timezone}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // DateTimeFormatter intentionally logs directly to avoid Logger cycle.
      console.error(`[DateTimeFormatter] Error formatting log timestamp: ${errorMessage}`);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toISOString();
    }
  }
}
