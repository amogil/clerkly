// Requirements: account-profile.1.1, account-profile.1.2, account-profile.1.3, account-profile.1.4, account-profile.1.8
import React, { useState, useEffect } from 'react';
import { Logger } from '../Logger';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('Account');

/**
 * User profile data from Google UserInfo API
 * Requirements: account-profile.1.2, account-profile.1.3
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
 * Requirements: account-profile.1.1, account-profile.1.2, account-profile.1.3, account-profile.1.4, account-profile.1.8
 */
export function Account({ className = '', onSignOut }: AccountProps) {
  // Requirements: account-profile.1.1, account-profile.1.2
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load profile data from cache on component mount
   * Requirements: account-profile.1.2, account-profile.1.7
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
        logger.error(`Failed to load profile: ${errorMessage}`);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  /**
   * Listen for auth success events and reload profile
   * Requirements: account-profile.1.2
   */
  useEffect(() => {
    const handleAuthSuccess = async () => {
      logger.info('Auth success event received, reloading profile');
      try {
        const result = await window.api.auth.getProfile();
        if (result.success) {
          setProfile(result.profile || null);
          setError(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Failed to reload profile after auth: ${errorMessage}`);
      }
    };

    window.api.auth.onAuthSuccess(handleAuthSuccess);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  /**
   * Listen for logout events and clear profile
   * Requirements: account-profile.1.8
   */
  useEffect(() => {
    const handleLogout = () => {
      logger.info('Logout event received, clearing profile');
      setProfile(null);
      setError(null);
    };

    window.api.auth.onLogout(handleLogout);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  /**
   * Listen for profile update events and reload profile
   * Requirements: account-profile.1.5
   */
  useEffect(() => {
    const handleProfileUpdated = (updatedProfile: UserProfile | null) => {
      logger.info('Profile updated event received, updating UI');
      setProfile(updatedProfile);
      setError(null);
    };

    window.api.auth.onProfileUpdated(handleProfileUpdated);

    // Note: Electron IPC doesn't provide removeListener for contextBridge exposed functions
    // The listener will be cleaned up when the window is closed
  }, []);

  // Requirements: account-profile.1.2
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

  // Requirements: account-profile.1.7
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

  // Requirements: account-profile.1.1
  // If no profile, show loading state (user should not be in Settings if not authenticated)
  // According to account-profile.1.1: "пользователь не может попасть в Settings без авторизации"
  if (!profile) {
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

  // Requirements: account-profile.1.2, account-profile.1.3, account-profile.1.4
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
          {/* Requirements: account-profile.1.3 - Display name field */}
          <div className="profile-field">
            <label htmlFor="profile-name" className="profile-label">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              readOnly
              disabled
              className="profile-input profile-input-disabled"
            />
          </div>

          {/* Requirements: account-profile.1.3 - Display email field */}
          <div className="profile-field">
            <label htmlFor="profile-email" className="profile-label">
              Email
            </label>
            <input
              id="profile-email"
              type="text"
              value={profile.email}
              readOnly
              disabled
              className="profile-input profile-input-disabled"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">Synced from Google Account</p>
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
          background: #fee2e2;
          border: 1px solid #fecaca;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: background-color 0.2s;
        }

        .sign-out-button:hover {
          background-color: #fecaca;
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

        .profile-input-disabled {
          background-color: rgba(0, 0, 0, 0.05);
          color: #6b7280;
          cursor: not-allowed;
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
