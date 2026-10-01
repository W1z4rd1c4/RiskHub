import { motion } from 'framer-motion';
import { Shield, ArrowRight, Zap, BarChart3, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { useTranslation } from '@/i18n/hooks';

export function HeroPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('common');

    const handleLogin = () => {
        // Mock login as admin (ID 1 from seed)
        // Mock auth removed
        void navigate('/');
    };

    return (
        <main className="relative min-h-screen w-full mesh-gradient overflow-hidden flex flex-col items-center justify-center px-6">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="z-10 text-center max-w-4xl"
            >
                <div className="flex justify-center mb-8">
                    <div className="glass p-3 rounded-2xl">
                        <Shield className="h-10 w-10 text-accent" />
                    </div>
                </div>

                <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight text-foreground mb-6">
                    <BrandWordmark accentClassName="text-accent-text underline decoration-4 underline-offset-8" />
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                    {t('hero.tagline')}
                    {' '}{t('hero.subtitle')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button
                        onClick={handleLogin}
                        className="btn-primary group"
                    >
                        {t('hero.access_platform')}
                        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <div className="flex items-center gap-6 mt-8 sm:mt-0 px-8 py-3 glass rounded-full text-sm font-medium text-foreground">
                        <span className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-success-text" />
                            {t('hero.secure_access')}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Feature Grid Mockup */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 1 }}
                className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl"
            >
                <div className="glass-card flex flex-col items-center text-center">
                    <Zap className="h-8 w-8 text-warning-text mb-4" />
                    <h3 className="text-lg font-bold mb-2">{t('hero.feature_analytics_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('hero.feature_analytics_desc')}</p>
                </div>

                <div className="glass-card flex flex-col items-center text-center">
                    <BarChart3 className="h-8 w-8 text-accent mb-4" />
                    <h3 className="text-lg font-bold mb-2">{t('hero.feature_sii_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('hero.feature_sii_desc')}</p>
                </div>

                <div className="glass-card flex flex-col items-center text-center">
                    <Shield className="h-8 w-8 text-success-text mb-4" />
                    <h3 className="text-lg font-bold mb-2">{t('hero.feature_rbac_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('hero.feature_rbac_desc')}</p>
                </div>
            </motion.div>

            {/* Footer Branding */}
            <div className="absolute bottom-10 text-muted-foreground text-xs tracking-widest uppercase font-bold">
                {t('hero.footer')}
            </div>
        </main>
    );
}

export default HeroPage;
