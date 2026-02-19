# Chatbot de Gestion de Connaissances avec JeuDeMots

Bot Discord qui collecte, valide et organise des connaissances en interagissant avec les utilisateurs et l'API [JeuDeMots](https://jdm-api.demo.lirmm.fr/schema).

## Fonctionnalités Clés

- **Collecte collaborative** : Les utilisateurs partagent des connaissances via Discord
- **Validation par consensus** : Le bot demande à d'autres utilisateurs de valider les informations
- **Système de confiance** : Chaque utilisateur a un score qui évolue selon ses contributions (calcul via intervention humaine)
- **Gestion de la polysémie** : Analyse contextuelle pour gérer les termes à plusieurs sens
- **Inférence logique** : Déduction de nouvelles relations via transitivité et typage
- **N-grams pour détection** : Recherche par 3-grams, 2-grams et tokens pour une meilleure détection des connaissances en attente

## État Actuel (19 février 2026)

### Implémenté
- Bot Discord fonctionnel avec Discord.js v14
- Gestion des messages et événements
- Réponses via OpenRouter (GLM 4.5 Air)
- Structure modulaire
- Connexion API JeuDeMots
- Recherche par n-grams pour matcher les connaissances "pending"
- Validation via boutons Discord (C'est vrai | C'est faux | Je ne sais pas)
- Table `validate` avec votes numériques (1 ou -1)
- Suppression automatique des stopwords pour éviter les faux matchs
- Formulation naturelle des relations sans type technique
- Base de données Supabase avec `users`, `relations`, `validate`

### Workflow de validation

1. **Proposition** : Un utilisateur dit "Le Boeing 747 a 4 moteurs"
   - Le bot enregistre la relation en base (statut: `pending`)
   - Bloc `[KNOWLEDGE]` avec métadonnées

2. **Détection** : Autre utilisateur demande "Parle-moi du Boeing 747"
   - Recherche n-gram détecte "boeing 747"
   - Trouve la relation `pending` en base
   - Bot répond normalement + envoie question de validation

3. **Validation** : Boutons "C'est vrai", "C'est faux", "Je ne sais pas"
   - Vote enregistré dans table `validate` (numériques: 1 ou -1)
   - Statut de la relation reste `pending` (jusqu'à intervention humaine)
   - Score utilisateur inchangé (calcul après validation humaine)

4. **Intervention humaine** (futur) : Analyse des votes + calcul du trust_score

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer le fichier .env
cp .env.example .env
# Éditer .env avec vos tokens Discord et clés API OpenRouter et Supabase

# 3. Démarrer en développement
npm run dev

# Ou en production
npm start
```

## Architecture Base de Données

### Tables principales

**users**
- `discord_id` (text, PK)
- `trust_score` (float, défaut 0.5)
- `created_at` (timestamp)

**relations**
- `id` (uuid, PK)
- `discord_id` (FK users)
- `terme_source`, `type_relation`, `terme_cible` (text)
- `est_vrai` (boolean)
- `contexte_annotation` (text)
- `statut` (text: pending / accepted / rejected)
- `created_at` (timestamp)

**validate**
- `id` (uuid, PK)
- `relation_id` (FK relations, ON DELETE CASCADE)
- `discord_id` (FK users)
- `vote` (integer: 1 ou -1)
- Contrainte UNIQUE: `(relation_id, discord_id)`
- `created_at` (timestamp)

## Utilisation

Le bot fonctionne de manière **conversationnelle** : interagissez avec lui comme avec une personne sur Discord.

### Exemple de dialogue

```
Utilisateur: "Le savais-tu ? Le Boeing 747 a 4 moteurs."
Bot: [enregistre en base, répond naturellement]

---

Autre utilisateur: "Parle-moi du Boeing 747"
Bot: [répond avec infos JeuDeMots]
Bot: [deuxième message] "D'ailleurs, quelqu'un a dit que Boeing 747 a 4 moteurs. Tu en penses quoi, c'est correct ?"
[Boutons: C'est vrai | C'est faux | Je ne sais pas]
```

## Points Techniques

### Détection des connaissances pending
- Extraction de n-grams (3-grams → 2-grams → tokens)
- Filtrage des stopwords (le, la, de, que, moi, etc.)
- Fallback sur pluriel `-s`
- Recherche case-insensitive
- Minimum 4 caractères par candidat

### Formulation naturelle des relations
- `r_has_part` → "X a Y"
- `r_isa` → "X est un/une Y" (avec gestion du genre)
- `r_lieu` → "X est dans Y"
- `r_carac` → "X est Y"
- `r_syn` → "X est un synonyme de Y"
- `r_anto` → "X est un contraire de Y"
- `r_agent` → "X est fait par Y"
- `r_patient` → "X agit sur Y"
- etc.

### Votes et validation
- Stockés en base comme entiers (1 = vrai, -1 = faux)
- Aucun calcul automatique de confiance
- Statut de relation inchangé jusqu'à validation humaine
- Chaque utilisateur ne peut voter qu'une fois par relation (contrainte UNIQUE)

### Nettoyage des données
- Bloc `[KNOWLEDGE]` automatiquement retiré de la réponse visible
- Types de relation (`r_...`) jamais affichés à l'utilisateur
- Les stopwords ne déclenchent pas de validation

## Ressources

- [API JeuDeMots](https://jdm-api.demo.lirmm.fr/schema)
- [Documentation Discord.js](https://discord.js.org/)
- [Consignes du projet](./consignes.txt)
- [Résumé des changements](./resume-changements.txt)

## À Faire (priorité)

- [ ] Dashboard/interface pour validation humaine des votes
- [ ] Calcul du trust_score après validation humaine
- [ ] Mise à jour du statut `relations` après validation
- [ ] Gestion des contextes ("aux USA", "en été", etc.)
- [ ] Meilleure inférence des relations par type
- [ ] Tests et optimisations API JeuDeMots
- [ ] Gestion du bouton "Je ne sais pas"

## Workflow futur (après validation humaine)

1. Admin/modérateur voit les votes dans `validate`
2. Décide si la relation est vraie/fausse/incertaine
3. Update `relations.statut` et `users.trust_score`
4. Propose correction à JeuDeMots ou enrichissement local
