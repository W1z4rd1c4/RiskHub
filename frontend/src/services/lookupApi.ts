const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

async function getHeaders(mockUserId: number | null) {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (mockUserId) {
        headers['X-Mock-User-Id'] = String(mockUserId);
    }
    return headers;
}

export const lookupApi = {
    async getUsers(mockUserId: number | null): Promise<any[]> {
        const response = await fetch(`${API_URL}/users`, {
            headers: await getHeaders(mockUserId),
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        return response.json();
    },

    async getDepartments(): Promise<any[]> {
        // For now, return mock departments since dedicated API is not yet ready
        // In a real scenario, this would be a fetch to /departments
        return [
            { id: 1, name: 'Operations', code: 'OPS' },
            { id: 2, name: 'Finance', code: 'FIN' },
            { id: 3, name: 'IT & Security', code: 'ITS' },
            { id: 4, name: 'Marketing', code: 'MKT' },
            { id: 5, name: 'Human Resources', code: 'HR' },
        ];
    }
};
