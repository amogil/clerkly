import { createContext, useContext, useState, ReactNode } from 'react';
import type { Contact } from '@/app/types/contact';

interface ContactsContextType {
  contacts: Contact[];
  addContact: (contact: Contact) => void;
  updateContact: (resourceName: string, updates: Partial<Contact>) => void;
  deleteContact: (resourceName: string) => void;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([
    {
      resourceName: 'people/c1',
      names: [{ displayName: 'Sarah Chen', givenName: 'Sarah', familyName: 'Chen' }],
      emailAddresses: [{ value: 'sarah.chen@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 123-4567', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Product Manager' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 24,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c2',
      names: [{ displayName: 'Mike Johnson', givenName: 'Mike', familyName: 'Johnson' }],
      emailAddresses: [{ value: 'mike.johnson@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 234-5678', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Engineering Manager' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 18,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c3',
      names: [{ displayName: 'Alex Rivera', givenName: 'Alex', familyName: 'Rivera' }],
      emailAddresses: [{ value: 'alex.rivera@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 345-6789', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Senior Engineer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 15,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c4',
      names: [{ displayName: 'Jessica Liu', givenName: 'Jessica', familyName: 'Liu' }],
      emailAddresses: [{ value: 'jessica.liu@company.com', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'UX Designer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 12,
      lastMeeting: 'Yesterday, 10:00 AM',
    },
    {
      resourceName: 'people/c5',
      names: [{ displayName: 'David Lee', givenName: 'David', familyName: 'Lee' }],
      emailAddresses: [{ value: 'david.lee@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 456-7890', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Product Designer' }],
      metadata: { sources: [{ type: 'PROFILE' }] },
      meetingsCount: 10,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      resourceName: 'people/c6',
      names: [{ displayName: 'Emma Wilson', givenName: 'Emma', familyName: 'Wilson' }],
      emailAddresses: [{ value: 'emma.wilson@company.com', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Frontend Developer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 14,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      resourceName: 'people/c7',
      names: [{ displayName: 'Jennifer Smith', givenName: 'Jennifer', familyName: 'Smith' }],
      emailAddresses: [{ value: 'jennifer.smith@clientco.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 567-8901', type: 'work' }],
      organizations: [{ name: 'ClientCo', title: 'CEO' }],
      metadata: { sources: [{ type: 'PROFILE' }] },
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
    {
      resourceName: 'people/c8',
      names: [{ displayName: 'Tom Anderson', givenName: 'Tom', familyName: 'Anderson' }],
      emailAddresses: [{ value: 'tom.anderson@clientco.com', type: 'work' }],
      organizations: [{ name: 'ClientCo', title: 'CTO' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
  ]);

  const addContact = (contact: Contact) => {
    setContacts(prev => [...prev, contact]);
  };

  const updateContact = (resourceName: string, updates: Partial<Contact>) => {
    setContacts(prev =>
      prev.map(contact =>
        contact.resourceName === resourceName ? { ...contact, ...updates } : contact
      )
    );
  };

  const deleteContact = (resourceName: string) => {
    setContacts(prev => prev.filter(contact => contact.resourceName !== resourceName));
  };

  return (
    <ContactsContext.Provider
      value={{
        contacts,
        addContact,
        updateContact,
        deleteContact,
      }}
    >
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts() {
  const context = useContext(ContactsContext);
  if (context === undefined) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return context;
}
