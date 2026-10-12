# Configuration Auth

Configurer NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local et les variables GitHub Actions. Utiliser uniquement une clé publique publishable ou anon.

Dans Supabase → Authentication → URL Configuration, autoriser :

- http://localhost:3000/auth/
- http://localhost:3000/auth/?mode=update
- https://brahmiamine.github.io/editor/auth/
- https://brahmiamine.github.io/editor/auth/?mode=update

Activer Email et la confirmation d’email. Vérifier la configuration SMTP pour les envois en production.

Parcours : /auth/?mode=login, signup, magic, reset. Le lien de récupération ouvre mode=update et une session Supabase avant de permettre updateUser({ password }).
