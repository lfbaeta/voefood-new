import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/hooks/useTheme';
import { useSlug, useBasePath } from '@/hooks/useSlug';
import { useAuth } from '@/hooks/useAuth';
import { useHasResellerSetupStatus } from '@/hooks/useHasResellerSetupStatus';

const Auth = () => {
  const navigate = useNavigate();
  const slug = useSlug();
  const basePath = useBasePath(slug);
  const menuPath = basePath || '/';
  const { toast } = useToast();
  const { user, isLoading: authLoading, signInWithGoogle, signOut } = useAuth();
  const { data: hasReseller, isLoading: loadingSetupStatus } = useHasResellerSetupStatus();
  const [signingIn, setSigningIn] = useState(false);

  useTheme();

  const checkRolesAndRedirect = useCallback(
    async (userId: string) => {
      try {
        if (hasReseller === false) {
          navigate('/setup', { replace: true });
          return;
        }

        const { data: isSuper } = await supabase.rpc('has_role', {
          _user_id: userId,
          _role: 'admin',
        });

        const { data: resellerData } = await supabase
          .from('resellers')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle();

        const { data: adminData } = await supabase
          .from('restaurant_admins')
          .select('restaurant_id, restaurants(slug)')
          .eq('user_id', userId)
          .maybeSingle();

        const adminRestaurantSlug = (adminData?.restaurants as any)?.slug as string | undefined;

        if (slug) {
          if (isSuper === true) {
            navigate(`${basePath}/admin`, { replace: true });
            return;
          }

          const { data: targetRestaurant } = await supabase
            .from('restaurants')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

          if (resellerData && targetRestaurant?.id) {
            const { data: isResOfThis } = await supabase.rpc('is_reseller_of_restaurant', {
              _user_id: userId,
              _restaurant_id: targetRestaurant.id,
            });
            if (isResOfThis === true) {
              navigate(`${basePath}/admin`, { replace: true });
              return;
            }
          }

          if (adminData && adminRestaurantSlug === slug) {
            navigate(`${basePath}/admin`, { replace: true });
            return;
          }

          await signOut();
          toast({
            title: 'Acesso negado',
            description: 'Sua conta não tem permissão para este restaurante.',
            variant: 'destructive',
          });
          return;
        }

        if (isSuper === true || resellerData) {
          navigate('/reseller', { replace: true });
          return;
        }

        if (adminData && adminRestaurantSlug) {
          navigate(`/r/${adminRestaurantSlug}/admin`, { replace: true });
          return;
        }

        await signOut();
        toast({
          title: 'Acesso negado',
          description: 'Sua conta ainda não possui permissão configurada no painel.',
          variant: 'destructive',
        });
      } catch (error) {
        console.error('Error checking roles:', error);
        toast({
          title: 'Erro ao validar permissões',
          description: 'Tente novamente em instantes.',
          variant: 'destructive',
        });
      }
    },
    [basePath, hasReseller, navigate, signOut, slug, toast],
  );

  useEffect(() => {
    if (authLoading || loadingSetupStatus) return;

    if (hasReseller === false) {
      navigate('/setup', { replace: true });
      return;
    }

    if (user?.id) {
      checkRolesAndRedirect(user.id);
    }
  }, [authLoading, checkRolesAndRedirect, hasReseller, loadingSetupStatus, navigate, user?.id]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser?.id) {
        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso.',
        });
        await checkRolesAndRedirect(signedInUser.id);
      }
    } catch (error: any) {
      console.error('Google sign-in failed:', error);
      toast({
        title: 'Erro ao entrar',
        description: error?.message || 'Não foi possível concluir o login com Google.',
        variant: 'destructive',
      });
    } finally {
      setSigningIn(false);
    }
  };

  const busy = authLoading || loadingSetupStatus || signingIn;

  return (
    <>
      <Helmet>
        <title>Entrar no Painel</title>
      </Helmet>

      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
              <UtensilsCrossed className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>

          <div className="bg-card rounded-3xl shadow-card p-8 border border-border">
            <h1 className="text-2xl font-bold text-center text-foreground mb-2">
              Entrar no Painel
            </h1>
            <p className="text-center text-muted-foreground mb-8">
              Acesse com sua conta Google para gerenciar o sistema
            </p>

            <Button
              type="button"
              size="lg"
              className="w-full h-12 rounded-xl text-base font-medium gap-3"
              onClick={handleGoogleLogin}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Autenticando...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M21.35 11.1H12v2.92h5.35c-.23 1.49-1.69 4.37-5.35 4.37-3.22 0-5.85-2.66-5.85-5.95s2.63-5.95 5.85-5.95c1.84 0 3.07.78 3.77 1.45l2.57-2.48C16.71 3.92 14.57 3 12 3 6.98 3 2.9 7.08 2.9 12.1S6.98 21.2 12 21.2c6.95 0 9.65-4.88 9.65-7.41 0-.5-.05-.88-.12-1.26l-.18-1.43z"
                    />
                  </svg>
                  Entrar com Google
                </>
              )}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate(menuPath)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← Voltar ao início
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
