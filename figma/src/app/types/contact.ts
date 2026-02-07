// Google Contacts API (People API) compatible types
// https://developers.google.com/people/api/rest/v1/people

export interface ContactName {
  displayName?: string;
  givenName?: string;
  familyName?: string;
}

export interface ContactEmail {
  value: string;
  type?: string; // e.g., "work", "home", "other"
}

export interface ContactPhone {
  value: string;
  type?: string; // e.g., "work", "home", "mobile", "other"
}

export interface ContactOrganization {
  name?: string; // Company name
  title?: string; // Job title
  department?: string;
}

export interface ContactPhoto {
  url: string;
  default?: boolean;
}

export interface ContactMetadata {
  sources?: Array<{
    type: string; // e.g., "CONTACT", "PROFILE"
    id?: string;
  }>;
}

export interface Contact {
  resourceName: string; // Unique identifier (e.g., "people/c1234567890")
  etag?: string;
  names?: ContactName[];
  emailAddresses?: ContactEmail[];
  phoneNumbers?: ContactPhone[];
  organizations?: ContactOrganization[];
  photos?: ContactPhoto[];
  metadata?: ContactMetadata;
  
  // Computed/custom fields for UI
  meetingsCount?: number;
  lastMeeting?: string;
}

// Helper function to get primary display name
export function getDisplayName(contact: Contact): string {
  return contact.names?.[0]?.displayName || 
         `${contact.names?.[0]?.givenName || ''} ${contact.names?.[0]?.familyName || ''}`.trim() ||
         'Unnamed Contact';
}

// Helper function to get primary email
export function getPrimaryEmail(contact: Contact): string | undefined {
  return contact.emailAddresses?.[0]?.value;
}

// Helper function to get primary phone
export function getPrimaryPhone(contact: Contact): string | undefined {
  return contact.phoneNumbers?.[0]?.value;
}

// Helper function to get company name
export function getCompanyName(contact: Contact): string | undefined {
  return contact.organizations?.[0]?.name;
}

// Helper function to get job title
export function getJobTitle(contact: Contact): string | undefined {
  return contact.organizations?.[0]?.title;
}

// Helper function to get initials for avatar
export function getInitials(contact: Contact): string {
  const name = contact.names?.[0];
  if (!name) return '?';
  
  if (name.givenName && name.familyName) {
    return `${name.givenName[0]}${name.familyName[0]}`.toUpperCase();
  }
  
  if (name.displayName) {
    const parts = name.displayName.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.displayName[0].toUpperCase();
  }
  
  return '?';
}

// Helper to check if contact is from Google
export function isGoogleContact(contact: Contact): boolean {
  return contact.metadata?.sources?.some(s => s.type === 'CONTACT') ?? false;
}
