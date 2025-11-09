'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Building2, Users } from 'lucide-react';

type Organization = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  total_credits_purchased: number;
  total_credits_used: number;
  is_active: boolean;
  created_at: string;
};

export default function OrganizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/organizations');
      const orgs = response.data.organizations || [];
      setOrganizations(orgs);
      
      if (orgs.length === 0) {
        setShowCreateForm(true);
      } else if (orgs.length === 1) {
        router.push(`/learn/org/${orgs[0].id}`);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      return;
    }

    try {
      setCreating(true);
      const response = await axios.post('/api/organizations', formData);
      const newOrg = response.data.organization;
      
      router.push(`/learn/org/${newOrg.id}`);
    } catch (error: any) {
      console.error('Failed to create organization:', error);
      alert(error.response?.data?.error || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (showCreateForm || organizations.length === 0) {
    return (
      <div className="container max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Create Your Organization
            </CardTitle>
            <CardDescription>
              Create an organization to manage API keys, team members, and credits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <div>
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Acme Inc"
                  required
                  disabled={creating}
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A brief description of your organization"
                  rows={3}
                  disabled={creating}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={creating || !formData.name.trim()}>
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Organization
                    </>
                  )}
                </Button>
                
                {organizations.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Organizations</h1>
          <p className="text-muted-foreground">Select an organization to manage</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Organization
        </Button>
      </div>

      <div className="grid gap-4">
        {organizations.map((org) => (
          <Card
            key={org.id}
            className="cursor-pointer hover:bg-accent transition-colors"
            onClick={() => router.push(`/learn/org/${org.id}`)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {org.name}
              </CardTitle>
              {org.description && (
                <CardDescription>{org.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Credits: </span>
                  <span className="font-medium">{org.credits}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <span className={org.is_active ? 'text-green-600' : 'text-red-600'}>
                    {org.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

