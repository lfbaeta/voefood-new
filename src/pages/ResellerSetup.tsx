import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Store, CheckCircle2 } from 'lucide-react';

const ResellerSetup = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading, signInWithGoogle, refreshRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    companyName: '',
    phone: '',
  });

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: prev.name || user.user_metadata?.full_name || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    const checkExistingReseller = async () => {
      try {
        const { data, error } = await supabase.rpc('get_has_any_reseller');
        if (!error && data === true) {
          navigate('/auth', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar revendedores:', error);
      } finally {
        setLoading(false);
      }
    };

    checkExistingReseller();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Não foi possível entrar com o Google.';
      toast({
        title: 'Erro ao autenticar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: 'Autenticação necessária',
        description: 'Conecte sua conta Google antes de concluir a configuração.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await supabase.functions.invoke('setup-reseller', {
        body: {
          name: formData.name,
          email: formData.email,
          companyName: formData.companyName || null,
          phone: formData.phone || null,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar revendedor');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      await refreshRole();
      await queryClient.invalidateQueries({ queryKey: ['setup-status-has-reseller'] });

      toast({
        title: 'Configuração concluída!',
        description: 'Bem-vindo ao painel de revendedor.',
      });

      navigate('/reseller', { replace: true });
    } catch (error: unknown) {
      console.error('Erro no setup:', error);
      const msg = error instanceof Error ? error.message : 'Erro ao configurar revendedor';
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
            <Store className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Configuração Inicial</CardTitle>
          <CardDescription>
            Conecte sua conta Google e crie seu perfil de revendedor para gerenciar restaurantes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!user ? (
            <div className="space-y-4">
              <Button
                type="button"
                size="lg"
                className="w-full h-12 rounded-xl gap-3"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
              >
                {signingIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  'Continuar com Google'
                )}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="truncate">Conectado como {user.email}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Seu nome *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="João Silva"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="seu@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da empresa (opcional)</Label>
                <Input
                  id="companyName"
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="Minha Empresa Ltda"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (opcional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  'Criar conta de revendedor'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResellerSetup;
