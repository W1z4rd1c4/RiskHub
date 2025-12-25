import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    role_display_name: string;
    permissions: string[];
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    error: string | null;
    hasPermission: (resource: string, action: string) => boolean;
    setMockUserId: (userId: number) => void;
    mockUserId: number | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mockUserId, setMockUserId] = useState<number | null>(null);

    const fetchCurrentUser = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const headers: HeadersInit = {};
            if (mockUserId) {
                headers['X-Mock-User-Id'] = String(mockUserId);
            }

            const response = await fetch(`${API_URL}/users/me`, { headers });

            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            } else {
                // For development, create a mock user if backend is not available
                setUser({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'Admin User',
                    role: 'admin',
                    role_display_name: 'Administrator',
                    permissions: ['*:*'],
                });
            }
        } catch (err) {
            // For development, create a mock user if backend is not available
            setUser({
                id: 1,
                email: 'admin@riskhub.local',
                name: 'Admin User',
                role: 'admin',
                role_display_name: 'Administrator',
                permissions: ['*:*'],
            });
            setError('Using mock user (backend not available)');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCurrentUser();
    }, [mockUserId]);

    const hasPermission = (resource: string, action: string): boolean => {
        if (!user || !user.permissions) return false;

        return user.permissions.some((perm) => {
            const [permResource, permAction] = perm.split(':');
            // Check for exact match or wildcard
            const resourceMatch = permResource === '*' || permResource === resource;
            const actionMatch = permAction === '*' || permAction === action;
            return resourceMatch && actionMatch;
        });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                error,
                hasPermission,
                setMockUserId,
                mockUserId,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
