import * as React from 'react';

export interface Session {
  user: {
    name?: string;
    email?: string;
    image?: string;
    roles?: string[]
  };
}

interface SessionContextType {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

const SessionContext = React.createContext<SessionContextType>({
  session: null,
  // Défaut d'un contexte sans fournisseur : personne ne doit l'appeler.
  setSession: () => { throw new Error('SessionContext utilisé hors de son fournisseur.'); },
});

export default SessionContext;

export const useSession = () => React.useContext(SessionContext);