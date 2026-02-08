// Requirements: ui.11.1, ui.11.3

/**
 * DateTimeFormatter utility class for formatting dates and times
 * Uses system locale (Intl.DateTimeFormat) for user-facing dates
 * Uses fixed format (YYYY-MM-DD HH:MM:SS) for logs
 *
 * Requirements: ui.11.1, ui.11.3
 */
export class DateTimeFormatter {
  /**
   * Format date only (no time) using system locale
   * Falls back to toLocaleDateString() on error
   *
   * Requirements: ui.11.1
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted date string
   */
  static formatDate(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

      // Use system locale (undefined) with date-only options
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });

      return formatter.format(date);
    } catch (error) {
      // Fallback to toLocaleDateString on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting date:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toLocaleDateString();
    }
  }

  /**
   * Format date and time using system locale
   * Falls back to toLocaleString() on error
   *
   * Requirements: ui.11.1
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted date and time string
   */
  static formatDateTime(timestamp: number | Date): string {
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

      // Use system locale (undefined) with date and time options
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });

      return formatter.format(date);
    } catch (error) {
      // Fallback to toLocaleString on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting date/time:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toLocaleString();
    }
  }

  /**
   * Format timestamp for logs using fixed format YYYY-MM-DD HH:MM:SS
   * Does NOT use system locale - always uses fixed format
   *
   * Requirements: ui.11.3
   *
   * @param timestamp - Unix timestamp in milliseconds or Date object
   * @returns Formatted timestamp string in YYYY-MM-DD HH:MM:SS format
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

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      // Fallback to ISO string on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DateTimeFormatter] Error formatting log timestamp:', errorMessage);

      const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
      return date.toISOString();
    }
  }
}
