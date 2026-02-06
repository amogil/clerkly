// Requirements: ui.6.1, ui.6.2, ui.6.3, ui.6.4, ui.6.8
import React, { useState, useEffect } from 'react';

/**
 * User profile data from Google UserInfo API
 * Requirements: ui.6.2, ui.6.3
 */
interface UserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  locale: string;
  picture?: string;
  lastUpdated: number;
}

/**
 * Props for Account component
 */
interface AccountProps {
  className?: string;
  onSignOut?: () => void;
}

/**
 * Account component displays user profile information
 * Shows empty state when not authenticated, profile data when authenticated
 * All profile fields are read-only
 * Requirements: ui.6.1, ui.6.2, ui.6.3, ui.6.4, ui.6.8
 */
export function Account({ className = '', onSignOut }: AccountProps) {
  // Requirements: ui.6.1, ui.6.2
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load profile data from cache on component mount
   * Requirements: ui.6.2, ui.6.7
   */
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await window.api.auth.getProfile();

        if (result.success) {
          setProfile(result.profile || null);
        } else {
          setError(result.error || 'Failed to load profile');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Account] Failed to load profile:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  /**
   * Listen for auth success events and reload profile
   * Requirements: ui.6.2
   */
  useEffect(() => {
    const handleAuthSuccess = async () => {
      console.log('[Account] Auth success event received, reloading profile');
      try {
        const result = await window.api.auth.getProfile();
        if (result.success) {
          setProfile(result.profile || null);
          setError(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Account] Failed to reload profile after auth:', errorMessage);
      }
    };

    window.api.auth.onAuthSuccess(handleAuthSuccess);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  /**
   * Listen for logout events and clear profile
   * Requirements: ui.6.8
   */
  useEffect(() => {
    const handleLogout = () => {
      console.log('[Account] Logout event received, clearing profile');
      setProfile(null);
      setError(null);
    };

    window.api.auth.onLogout(handleLogout);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  /**
   * Listen for profile update events and reload profile
   * Requirements: ui.6.5
   */
  useEffect(() => {
    const handleProfileUpdated = (updatedProfile: UserProfile | null) => {
      console.log('[Account] Profile updated event received, updating UI');
      setProfile(updatedProfile);
      setError(null);
    };

    window.api.auth.onProfileUpdated(handleProfileUpdated);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  // Requirements: ui.6.2
  // Show loading state
  if (loading) {
    return (
      <div className={`account-container ${className}`}>
        <div className="account-card">
          <h2 className="account-title">Account</h2>
          <div className="account-loading">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-2">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  // Requirements: ui.6.7
  // Show error state
  if (error) {
    return (
      <div className={`account-container ${className}`}>
        <div className="account-card">
          <h2 className="account-title">Account</h2>
          <div className="account-error">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Requirements: ui.6.1
  // Show empty state when not authenticated
  if (!profile) {
    return (
      <div className={`account-container ${className}`}>
        <div className="account-card">
          <h2 className="account-title">Account</h2>
          <div className="account-empty">
            <p className="text-muted-foreground">Not signed in</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to view your account information
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Requirements: ui.6.2, ui.6.3, ui.6.4
  // Show profile data with read-only fields
  return (
    <div className={`account-container ${className}`}>
      <div className="account-card">
        <div className="account-header">
          <h2 className="account-title">Account</h2>
          {onSignOut && (
            <button onClick={onSignOut} className="sign-out-button">
              Sign out
            </button>
          )}
        </div>
        <div className="account-profile">
          {/* Requirements: ui.6.3 - Display name field */}
          <div className="profile-field">
            <label htmlFor="profile-name" className="profile-label">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              readOnly
              className="profile-input"
            />
          </div>

          {/* Requirements: ui.6.3 - Display email field */}
          <div className="profile-field">
            <label htmlFor="profile-email" className="profile-label">
              Email
            </label>
            <input
              id="profile-email"
              type="text"
              value={profile.email}
              readOnly
              className="profile-input"
            />
          </div>
        </div>
      </div>

      {/* Inline styles for Account component */}
      <style>{`
        .account-container {
          padding: 1rem;
        }

        .account-card {
          background: white;
          border-radius: 0.5rem;
          padding: 1.5rem;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .account-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .sign-out-button {
          font-size: 0.875rem;
          color: #dc2626;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          transition: background-color 0.2s;
        }

        .sign-out-button:hover {
          background-color: #fee2e2;
        }

        .account-loading,
        .account-error,
        .account-empty {
          padding: 2rem;
          text-align: center;
        }

        .account-profile {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .profile-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .profile-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .profile-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          background-color: #f9fafb;
          color: #1f2937;
          cursor: default;
        }

        .profile-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
      `}</style>
    </div>
  );
}
