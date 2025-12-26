import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/services/authApi';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    role_display_name: string;
    department_id?: number;
    department_name?: string;
    permissions: string[];
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    hasPermission: (resource: string, action: string) => boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setTokenState] = useState<string | null>(() =>
        localStorage.getItem('access_token')
    );
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const setToken = (newToken: string) => {
        localStorage.setItem('access_token', newToken);
        setTokenState(newToken);
    };

    const login = async (email: string, password: string): Promise<User> => {
        try {
            const response = await authApi.login({ email, password });
            setToken(response.access_token);
            setUser(response.user);
            return response.user;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Login failed');
        }
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        setTokenState(null);
        setUser(null);
    };

    useEffect(() => {
        const fetchCurrentUser = async () => {
            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const userData = await authApi.getCurrentUser(token);
                setUser(userData);
            } catch (err) {
                // Token invalid, clear it
                logout();
            } finally {
                setIsLoading(false);
            }
        };

        fetchCurrentUser();
    }, [token]);

    const hasPermission = (resource: string, action: string): boolean => {
        if (!user?.permissions) return false;
        return user.permissions.some((perm) => {
            const [permResource, permAction] = perm.split(':');
            return (permResource === '*' || permResource === resource) &&
                (permAction === '*' || permAction === action);
        });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                hasPermission,
                isAuthenticated: !!token && !!user,
                login,
                logout,
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
