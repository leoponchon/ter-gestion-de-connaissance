# Chatbot de Gestion de Connaissances avec JeuDeMots

Bot Discord qui collecte, valide et organise des connaissances en interagissant avec les utilisateurs et l'API [JeuDeMots](https://jdm-api.demo.lirmm.fr/schema).

## Fonctionnalités Clés

- **Collecte collaborative** : Les utilisateurs partagent des connaissances via Discord
- **Validation par consensus** : Le bot demande à d'autres utilisateurs de valider les informations
- **Système de confiance** : Chaque utilisateur a un score qui évolue selon ses contributions (calcul via intervention humaine)
- **Gestion de la polysémie** : Analyse contextuelle pour gérer les termes à plusieurs sens
- **Inférence logique** : Déduction de nouvelles relations via transitivité et typage
- **N-grams pour détection** : Recherche par 3-grams, 2-grams et tokens pour une meilleure détection des connaissances en attente
- **API Fastify documentée** : Accès HTTP aux données Supabase avec schéma OpenAPI 3.1 et documentation Redoc

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
- Serveur Fastify avec endpoints documentés, `/openapi.json`, `/docs` et `/health`

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

## Variables d'environnement

Le projet attend les variables suivantes dans `.env` :

- `DISCORD_TOKEN`
- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `HOST` (optionnel, défaut `0.0.0.0`)
- `PORT` (optionnel, défaut `8080`)

Un fichier d'exemple est fourni dans [.env.example](./.env.example).

## API HTTP et OpenAPI

Le mini serveur HTTP a été remplacé par une vraie API Fastify. Une fois le projet démarré :

- `GET /health` : état du bot Discord et de la connexion Supabase
- `GET /openapi.json` : schéma OpenAPI 3.1
- `GET /docs` : documentation Redoc

### Endpoints Supabase exposés

- `GET /api/users/:discordId`
- `POST /api/users/:discordId/ensure`
- `GET /api/relations`
- `GET /api/relations/:relationId`
- `GET /api/relations/pending/search?term=...`
- `POST /api/relations`
- `GET /api/votes`
- `POST /api/relations/:relationId/votes`

### Exemple d'appel

```bash
curl "http://localhost:8080/api/relations?status=pending&limit=10"
```

### Pourquoi passer par Fastify au lieu d'exposer Supabase directement

- la clé Supabase reste côté serveur
- on contrôle exactement les tables et colonnes exposées
- on peut documenter l'API avec OpenAPI 3.1
- le bot Discord et l'API réutilisent les mêmes fonctions métier

## Architecture Base de Données

### Tables principales

**users**
- `discord_id` (text, PK)
- `trust_score` (float, défaut 0.5, range [0, 1])
- `created_at` (timestamp)

**relations**
- `id` (uuid, PK)
- `discord_id` (FK users)
- `terme_source`, `type_relation`, `terme_cible` (text)
- `est_vrai` (string: "true" / "false" / "maybe") - intention du proposant
- `contexte_annotation` (text) - annotations optionnelles ("aux USA", "en été", etc.)
- `weight` (integer, défaut 0) - poids de vérité final (-200 à +1000)
  - **Négatif** : relation fausse
  - **0** : incertain ou nouvellement proposée
  - **Positif** : relation vraie (plus la valeur est haute, plus on a confiance)
  - **> 1000** : relations acceptées avec haute confiance (utilisé pour pièges vrais)
- `proposer_trust_score` (float) - score de confiance du proposant au moment de l'ajout
- `statut` (text: pending / accepted / rejected)
  - `pending` : en attente de votes (< 10 votants)
  - `accepted` : validée après 10 votes avec score moyen positif
  - `rejected` : rejetée après 10 votes avec score moyen négatif
- `created_at` (timestamp)

**validate**
- `id` (uuid, PK)
- `relation_id` (FK relations, ON DELETE CASCADE)
- `discord_id` (FK users) - votant
- `vote` (integer: 1 = vrai, -1 = faux)
- Contrainte UNIQUE: `(relation_id, discord_id)` - un vote par personne par relation
- `created_at` (timestamp)

### Système de Validation et Poids

**Workflow d'ajout de relation** :
1. Utilisateur propose : "Un hotdog contient de la moutarde."
2. Bot extrait : `{ source: "hotdog", relation: "r_has_part", cible: "moutarde", est_vrai: "true" }`
3. Vérification : `trust_score >= 0.7` ?
   - **Oui** → Relation ajoutée avec `weight=0`, `statut=pending`
   - **Non** → Rejet : "Ton score de fiabilité insuffisant (min 0.7)"
4. Bot pose la question à d'autres utilisateurs via boutons

**Workflow de validation** :
1. 10 utilisateurs **distincts** votent (1 vote par personne)
2. Après le 10e vote unique, calcul automatique :
   ```
   avgScore = SUM(vote * votant_trust_score) / 10
   ```
3. **Détermination du statut** :
   - `avgScore > 0.2` → `accepted`, `weight = avgScore * 500` (0 à 1000+)
   - `avgScore < -0.2` → `rejected`, `weight = avgScore * 100` (-200 à 0)
   - `-0.2 <= avgScore <= 0.2` → `pending`, `weight = 0` (incertain)
4. Relation finalisée, relation supprimée des validations

**Pièges dynamiques** :
- **Vrais (60%)** : Relations `accepted` avec `weight > 1000` → réponse attendue = "vrai"
- **Faux (40%)** : Combinaisons aléatoires n'existant nulle part en BD/JDM → réponse attendue = "faux"

### Priorité de recherche

Quand l'utilisateur parle d'un sujet :
1. Chercher d'abord dans `relations` avec `statut = "accepted"` (BD locale validée)
2. Fallback → API JeuxDeMots
3. Si aucune → répondre sans données de soutien

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

## À Faire (priorité)

- [ ] Affiner le calcul du weight
- [ ] Dashboard/interface pour visualiser les votes
- [ ] Gestion des contextes ("aux USA", "en été", etc.)
- [ ] Meilleure inférence des relations par type
- [ ] Tests et optimisations API JeuDeMots
- [ ] Gestion du bouton "Je ne sais pas"

## Workflow futur (après validation humaine)

1. Utilisateur propose relation (si trust_score >= 0.7)
2. Relation insérée avec `weight=0, statut=pending`
3. Bot pose question à 10 utilisateurs différents
4. Après 10e vote unique → calcul automatique + finalization
5. Relation → `accepted` ou `rejected` avec weight calculé
