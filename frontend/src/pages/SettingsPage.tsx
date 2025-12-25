import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
                <p className="text-slate-500">Manage application settings</p>
            </div>

            <Tabs defaultValue="general" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="roles">Roles</TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>General Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center text-slate-400">
                            General settings coming soon
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Management</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center text-slate-400">
                            User management will be implemented in Phase 1.3
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="roles">
                    <Card>
                        <CardHeader>
                            <CardTitle>Role Management</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center text-slate-400">
                            Role management will be implemented in Phase 1.3
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
