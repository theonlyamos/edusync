'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Copy, Eye, EyeOff, Plus, Trash2, CheckCircle, Loader2, Key } from 'lucide-react';

interface ApiKey {
    id: string;
    name: string;
    description: string | null;
    api_key: string;
    allowed_domains: string[] | null;
    is_active: boolean;
    rate_limit_per_hour: number;
    rate_limit_per_day: number;
    total_requests: number;
    total_minutes_used: number;
    last_used_at: string | null;
    created_at: string;
    expires_at: string | null;
}

interface AdminApiKeysTabProps {
    organizationId: string;
}

export function AdminApiKeysTab({ organizationId }: AdminApiKeysTabProps) {
    const { toast } = useToast();
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewKeyForm, setShowNewKeyForm] = useState(false);
    const [newKeyData, setNewKeyData] = useState({
        name: '',
        description: '',
        allowed_domains: '',
    });
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    useEffect(() => {
        fetchApiKeys();
    }, [organizationId]);

    const fetchApiKeys = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/admin/organizations/${organizationId}/keys`);
            if (response.ok) {
                const data = await response.json();
                setApiKeys(data ?? []);
            }
        } catch (err: any) {
            toast({
                title: 'Error',
                description: 'Failed to fetch API keys',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const createApiKey = async () => {
        try {
            const domains = newKeyData.allowed_domains
                .split('\n')
                .map(d => d.trim())
                .filter(d => d.length > 0);

            const payload: any = {
                name: newKeyData.name,
                description: newKeyData.description || null,
                allowed_domains: domains.length > 0 ? domains : null,
            };

            const response = await fetch(`/api/admin/organizations/${organizationId}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create API key');
            }

            const data = await response.json();
            toast({
                title: 'Success',
                description: 'API key created successfully!',
            });
            setApiKeys([data, ...apiKeys]);
            setNewKeyData({ name: '', description: '', allowed_domains: '' });
            setShowNewKeyForm(false);
            setVisibleKeys(new Set([data.id]));
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to create API key',
                variant: 'destructive',
            });
        }
    };

    const deleteApiKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this API key?')) return;

        try {
            const response = await fetch(`/api/admin/organizations/${organizationId}/keys/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok && response.status !== 204) {
                throw new Error('Failed to delete API key');
            }

            setApiKeys(apiKeys.filter(k => k.id !== id));
            toast({
                title: 'Success',
                description: 'API key deleted successfully',
            });
        } catch (err: any) {
            toast({
                title: 'Error',
                description: 'Failed to delete API key',
                variant: 'destructive',
            });
        }
    };

    const toggleKeyVisibility = (id: string) => {
        setVisibleKeys(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(id);
            toast({ title: 'Copied to clipboard!' });
            setTimeout(() => setCopiedKey(null), 2000);
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to copy to clipboard',
                variant: 'destructive',
            });
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const response = await fetch(`/api/admin/organizations/${organizationId}/keys/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !currentStatus }),
            });

            if (!response.ok) throw new Error('Failed to update API key');

            const data = await response.json();
            setApiKeys(apiKeys.map(k => k.id === id ? data : k));
            toast({
                title: 'Success',
                description: `API key ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
            });
        } catch (err: any) {
            toast({
                title: 'Error',
                description: 'Failed to update API key',
                variant: 'destructive',
            });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                API Keys
                            </CardTitle>
                            <CardDescription>
                                Manage API keys for embedding AI sessions
                            </CardDescription>
                        </div>
                        <Button onClick={() => setShowNewKeyForm(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Key
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                        </div>
                    ) : apiKeys.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No API keys yet. Create one to get started.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {apiKeys.map(key => (
                                <div key={key.id} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-semibold">{key.name}</h4>
                                                <Badge variant={key.is_active ? 'default' : 'secondary'}>
                                                    {key.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </div>
                                            {key.description && (
                                                <p className="text-sm text-muted-foreground">{key.description}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => toggleActive(key.id, key.is_active)}
                                            >
                                                {key.is_active ? 'Disable' : 'Enable'}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => deleteApiKey(key.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <Label className="text-xs text-muted-foreground">API Key</Label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-xs"
                                                    onClick={() => copyToClipboard(key.api_key, `key-${key.id}`)}
                                                >
                                                    {copiedKey === `key-${key.id}` ? (
                                                        <>
                                                            <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                                                            Copied!
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3 h-3 mr-1" />
                                                            Copy Key
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 bg-muted p-2 rounded text-sm font-mono overflow-x-auto">
                                                    {visibleKeys.has(key.id)
                                                        ? key.api_key
                                                        : key.api_key.slice(0, 12) + '•'.repeat(48)}
                                                </code>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => toggleKeyVisibility(key.id)}
                                                >
                                                    {visibleKeys.has(key.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">Requests:</span>{' '}
                                                <span className="font-medium">{key.total_requests}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Minutes:</span>{' '}
                                                <span className="font-medium">{key.total_minutes_used}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Rate limit:</span>{' '}
                                                <span className="font-medium">{key.rate_limit_per_hour}/hr</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Last used:</span>{' '}
                                                <span className="font-medium">
                                                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                                                </span>
                                            </div>
                                        </div>

                                        {key.allowed_domains && key.allowed_domains.length > 0 && (
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Allowed domains:</span>{' '}
                                                <span className="font-medium">{key.allowed_domains.join(', ')}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showNewKeyForm} onOpenChange={setShowNewKeyForm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New API Key</DialogTitle>
                        <DialogDescription>
                            Generate a new API key for this organization
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="api-key-name">Name *</Label>
                            <Input
                                id="api-key-name"
                                value={newKeyData.name}
                                onChange={e => setNewKeyData({ ...newKeyData, name: e.target.value })}
                                placeholder="Production Website"
                            />
                        </div>
                        <div>
                            <Label htmlFor="api-key-description">Description</Label>
                            <Input
                                id="api-key-description"
                                value={newKeyData.description}
                                onChange={e => setNewKeyData({ ...newKeyData, description: e.target.value })}
                                placeholder="Used for embedding on example.com"
                            />
                        </div>
                        <div>
                            <Label htmlFor="api-key-domains">Allowed Domains (one per line, optional)</Label>
                            <Textarea
                                id="api-key-domains"
                                value={newKeyData.allowed_domains}
                                onChange={e => setNewKeyData({ ...newKeyData, allowed_domains: e.target.value })}
                                placeholder="example.com&#10;*.example.com"
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Leave empty to allow all domains.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowNewKeyForm(false);
                            setNewKeyData({ name: '', description: '', allowed_domains: '' });
                        }}>
                            Cancel
                        </Button>
                        <Button onClick={createApiKey} disabled={!newKeyData.name.trim()}>
                            Create Key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
