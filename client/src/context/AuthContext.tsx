import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getMe, logout as apiLogout } from '../api';

export interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (userData: User, csrfToken: string) => void;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async () => {
        try {
            const userData = await getMe();
            setUser(userData);
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const login = (userData: User, csrfToken: string) => {
        setUser(userData);
        localStorage.setItem('csrfToken', csrfToken); // เก็บ CSRF token ไว้ส่งใน Header
    };

    const logout = async () => {
        try {
            await apiLogout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            localStorage.removeItem('csrfToken');
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        return {
            user: null,
            loading: false,
            login: () => {},
            logout: async () => {},
            checkAuth: async () => {},
        };
    }
    return context;
};