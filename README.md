# Chatbot de Gestion de Connaissances avec JeuDeMots

Bot Discord qui collecte, valide et organise des connaissances en interagissant avec les utilisateurs et l'API [JeuDeMots](https://jdm-api.demo.lirmm.fr/schema).

## Fonctionnalités Clés

- **Collecte collaborative** : Les utilisateurs partagent des connaissances via Discord
- **Validation par consensus** : Le bot demande à d'autres utilisateurs de valider les informations
- **Système de confiance** : Chaque utilisateur a un score qui évolue selon ses contributions
- **Gestion de la polysémie** : Analyse contextuelle pour gérer les termes à plusieurs sens
- **Inférence logique** : Déduction de nouvelles relations via transitivité et typage

## État Actuel

### Implémenté
- Bot Discord fonctionnel avec Discord.js v14
- Gestion des messages et événements
- Réponses via OpenRouter
- Structure modulaire
- Connexion API JeuDeMots

### En cours
- Base de données
- Système de validation

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer le fichier .env
cp .env.example .env
# Éditer .env avec vos tokens Discord et clés API

# 3. Démarrer
npm start
```

## Utilisation

Le bot fonctionne de manière **conversationnelle** : interagissez avec lui comme avec une personne sur Discord, il vous répondra automatiquement.

### Comment interagir

Il suffit de discuter naturellement dans le channel discord qui lui est lié.

## Validation des Connaissances

### Exemple de dialogue naturel

```
Léo Faucon : Ah au fait, un hotdog contient de la moutarde aux USA.

Bot : Intéressant ! Merci Léo Faucon. Ton voyage s'est bien passé ?

Plus tard, avec Léo Ponchon...

Léo Ponchon : Tiens d'ailleurs, je mangerais bien un hotdog.

Bot : Oui, bonne idée, c'est très bon les hotdogs. Tiens d'ailleurs, il parait qu'un hotdog contient de la moutarde (surtout aux USA). Penses-tu que c'est vrai ?

Léo Ponchon : Oui, c'est vrai.

Bot : Super ! Merci pour ta validation. Bon appétit !
```

## Ressources

- [API JeuDeMots](https://jdm-api.demo.lirmm.fr/schema)
- [Documentation Discord.js](https://discord.js.org/)
- [Consignes du projet](./consignes.txt)

## À Faire

- Créer la base de données (SQLite/PostgreSQL)
- Développer l'analyseur linguistique
- Implémenter le système de confiance par utilisateur
- Créer le moteur d'inférence logique

---
