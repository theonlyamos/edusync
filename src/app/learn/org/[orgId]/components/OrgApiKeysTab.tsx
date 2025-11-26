'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Eye, EyeOff, Plus, Trash2, CheckCircle, Loader2 } from 'lucide-react';

type ApiKey = {
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
  organization_id?: string | null;
};

type OrgApiKeysTabProps = {
  organizationId: string;
  isOwnerOrAdmin: boolean;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
};

export default function OrgApiKeysTab({ organizationId, isOwnerOrAdmin, onError, onSuccess }: OrgApiKeysTabProps) {
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
      const url = `/api/embed/keys?organization_id=${organizationId}`;
      const response = await axios.get(url);
      setApiKeys(response.data.apiKeys);
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to fetch API keys');
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
        organization_id: organizationId,
      };

      const response = await axios.post('/api/embed/keys', payload);

      onSuccess('API key created successfully! Make sure to copy it now - you won\'t be able to see it again.');
      setApiKeys([response.data.apiKey, ...apiKeys]);
      setNewKeyData({ name: '', description: '', allowed_domains: '' });
      setShowNewKeyForm(false);

      setVisibleKeys(new Set([response.data.apiKey.id]));
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to create API key');
    }
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/embed/keys/${id}`);
      setApiKeys(apiKeys.filter(k => k.id !== id));
      onSuccess('API key deleted successfully');
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to delete API key');
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
      onSuccess('Copied to clipboard!');
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (err) {
      onError('Failed to copy to clipboard');
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await axios.patch(`/api/embed/keys/${id}`, {
        is_active: !currentStatus
      });
      setApiKeys(apiKeys.map(k => k.id === id ? response.data.apiKey : k));
      onSuccess(`API key ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
    } catch (err: any) {
      onError(err.response?.data?.error || 'Failed to update API key');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage API keys for embedding AI sessions. Credits will be deducted from the organization.
              </CardDescription>
            </div>
            {isOwnerOrAdmin && (
              <Button onClick={() => setShowNewKeyForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create New Key
              </Button>
            )}
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
                    {isOwnerOrAdmin && (
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
                    )}
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
                          title={visibleKeys.has(key.id) ? 'Hide key' : 'Show key'}
                        >
                          {visibleKeys.has(key.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Embed Code (Copy & Paste)</Label>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => copyToClipboard(
                            `<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/embed/new?apiKey=${key.api_key}&topic=Your%20Topic" width="100%" height="600px" frameborder="0" allow="microphone"></iframe>`,
                            `embed-${key.id}`
                          )}
                        >
                          {copiedKey === `embed-${key.id}` ? (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              Copy Embed Code
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="relative">
                        <pre className="bg-muted p-3 rounded text-xs overflow-x-auto select-all hover:bg-muted/80 transition-colors cursor-pointer"
                          onClick={() => copyToClipboard(
                            `<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/embed/new?apiKey=${key.api_key}&topic=Your%20Topic" width="100%" height="600px" frameborder="0" allow="microphone"></iframe>`,
                            `embed-click-${key.id}`
                          )}
                          title="Click to copy">
                          {`<iframe 
  src="${typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/embed/new?apiKey=${key.api_key}&topic=Your%20Topic"
  width="100%" 
  height="600px"
  frameborder="0"
  allow="microphone"
></iframe>`}
                        </pre>
                        <p className="text-xs text-muted-foreground mt-2">
                          💡 Tip: Replace "Your%20Topic" with your desired topic (URL-encoded)
                        </p>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Embed with iframe (Simple - Recommended)</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
              {`<iframe 
  src="https://yourapp.com/embed/new?apiKey=YOUR_API_KEY&topic=Photosynthesis"
  width="100%" 
  height="600px"
  frameborder="0"
  allow="microphone"
></iframe>`}
            </pre>
            <p className="text-sm text-muted-foreground mt-2">
              Add <code className="bg-muted px-1 py-0.5 rounded">&topic=Your%20Topic</code> to pre-fill the session topic. No API calls needed!
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Create session via API (Advanced)</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
              {`fetch('https://yourapp.com/api/embed/sessions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ topic: 'Photosynthesis' })
})
.then(res => res.json())
.then(data => {
  // Use data.sessionId to embed
  console.log('Session ID:', data.sessionId);
});`}
            </pre>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
            <p className="text-sm">
              <strong>Note:</strong> Credits will be deducted from the organization at 1 credit per minute of active AI time.
              Make sure the organization has sufficient credits before embedding sessions.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showNewKeyForm} onOpenChange={setShowNewKeyForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for embedding AI sessions on external platforms
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
                placeholder="example.com&#10;*.example.com&#10;app.example.com"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to allow all domains. Use * for wildcards (e.g., *.example.com)
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

