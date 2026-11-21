# 1Entrer - Rapports de chantier

Ce projet permet à un contremaître de remplir un rapport de chantier avec les heures de son équipe. Il peut ensuite retrouver ses rapports et consulter le total des heures. Un admin peut lire tous les rapports de son entreprise.

Le point auquel j'ai fait le plus attention est la séparation entre les entreprises : un compte de l'entreprise A ne doit pas pouvoir consulter ni créer un rapport pour l'entreprise B, même en changeant les informations envoyées au serveur.

Le projet utilise Node.js, TypeScript, Express et SQLite.

**Temps consacré à l'exercice : 3 heures.**

## 1. Lancer le projet avec Docker

C'est la façon prévue pour essayer le projet. Docker prépare l'environnement nécessaire : vous n'avez pas besoin d'installer Node.js ou une base de données séparément.

### Préparer le dossier

1. Installez Docker Desktop si vous ne l'avez pas déjà, puis ouvrez-le. Attendez que son moteur soit démarré.
2. Récupérez le projet. Sur GitHub, cliquez sur **Code**, puis **Download ZIP**, et extrayez le ZIP dans un dossier.
3. Ouvrez le dossier qui contient le fichier `compose.yaml`. Si vous voyez seulement un autre dossier, ouvrez celui-ci.
4. Sur Windows, cliquez dans la barre d'adresse de l'Explorateur, tapez `powershell`, puis appuyez sur Entrée. La fenêtre s'ouvre directement dans le bon dossier.

Une connexion Internet est nécessaire lors de la première construction pour télécharger l'environnement et les dépendances.

### Démarrer

Dans cette fenêtre, lancez :

```powershell
docker compose up --build
```

La première fois, la préparation peut prendre quelques minutes. Le démarrage est terminé lorsque cette ligne apparaît, éventuellement précédée de `api-1 |` :

```text
API sur le port 3000
```

Gardez cette fenêtre ouverte. Le serveur est maintenant accessible à l'adresse `http://localhost:3000`.

Sur Windows, vous pouvez aussi double-cliquer sur **`DEMARRER-WINDOWS.cmd`** après avoir ouvert Docker Desktop. Il lance la même commande.

Il s'agit d'une API : on lui envoie des demandes pour recevoir des données. Pour l'essayer, suivez les commandes de la section 4. Ouvrir simplement l'adresse dans un navigateur ne donne pas de formulaire ou de page d'accueil.

### Arrêter et relancer

Pour arrêter, faites **Ctrl+C** dans la fenêtre du serveur. Vous pouvez ensuite exécuter :

```powershell
docker compose down
```

Pour relancer, utilisez à nouveau `docker compose up --build`. Les rapports restent dans un espace de stockage Docker appelé un volume ; un arrêt normal ne les efface pas.

## 2. Lancer les tests

Ouvrez une deuxième fenêtre PowerShell dans le même dossier que `compose.yaml`, puis lancez :

```powershell
docker build --no-cache --progress=plain --target test -t 1entrer-tests .
```

Cette commande vérifie les types TypeScript, lance les 12 tests, puis compile le code. L'option `--no-cache` force leur exécution, même si Docker a déjà construit cette partie du projet. Il faut donc attendre la fin de la commande.

Dans les résultats, vous devez voir :

```text
# tests 12
# pass 12
# fail 0
```

La compilation qui suit doit aussi se terminer sans erreur. Les tests utilisent chacun une base temporaire : ils ne modifient pas les rapports que vous avez créés dans l'API.

Ils vérifient notamment :

- Le refus d'accès à un rapport d'une autre entreprise, y compris pour un admin.
- La séparation entre deux contremaîtres de la même entreprise.
- La lecture des rapports de son entreprise par un admin.
- Le refus de choisir une autre entreprise ou un autre auteur dans une création.
- Les heures, les dates, les champs obligatoires et le calcul du total.
- Les jetons absents, invalides ou expirés et les mauvaises connexions.
- L'annulation de toute la création si l'enregistrement d'une ligne échoue.
- Les contraintes de la base et la relance des données de départ sans doublons.

Le message `Erreur interne: test rollback` est attendu pendant un test : celui-ci provoque volontairement une erreur pour vérifier que rien n'est enregistré à moitié. Un avertissement indiquant que SQLite est expérimental peut aussi apparaître avec Node 22.

Un fichier GitHub Actions lance également les tests, le contrôle TypeScript et la compilation à chaque push ou pull request. Son résultat se consulte dans l'onglet **Actions** du dépôt.

## 3. Comptes pour essayer

Au démarrage avec Docker Compose, deux entreprises sont créées, chacune avec un admin et un contremaître. Voici les quatre comptes de démonstration :

| Entreprise | Rôle | Courriel |
| --- | --- | --- |
| A | Admin | `admin.a@example.com` |
| A | Contremaître | `foreman.a@example.com` |
| B | Admin | `admin.b@example.com` |
| B | Contremaître | `foreman.b@example.com` |

Le mot de passe des quatre comptes est **`Demo-chantier-2026!`**.

`foreman` veut dire contremaître dans le code. Les courriels et le mot de passe ont été choisis pour la démonstration ; ils ne sont pas fournis par l'énoncé. En base, les mots de passe sont conservés sous forme d'empreintes calculées avec scrypt, avec un sel aléatoire propre à chaque compte.

Relancer le projet ne crée pas les comptes en double. Sur une installation neuve, il n'y a pas encore de rapports : les commandes ci-dessous permettent d'en ajouter. Ces comptes de démonstration sont destinés aux essais locaux.

## 4. Essayer les fonctions, étape par étape

Laissez le serveur tourner dans sa première fenêtre. Dans une **deuxième fenêtre PowerShell**, copiez les blocs suivants **dans l'ordre et dans la même fenêtre**. Les variables gardent les informations nécessaires d'une étape à l'autre.

### A. Se connecter avec le contremaître de A

```powershell
$base = 'http://localhost:3000'
$typeJson = 'application/json; charset=utf-8'

$identifiantsA = @{
  email = 'foreman.a@example.com'
  password = 'Demo-chantier-2026!'
} | ConvertTo-Json

$connexionA = Invoke-RestMethod "$base/login" -Method Post -ContentType $typeJson -Body $identifiantsA

$headersA = @{
  Authorization = "Bearer $($connexionA.token)"
}

Write-Host 'Connexion A réussie.'
```

La connexion renvoie un jeton valable une heure, rangé ici dans `$connexionA.token`. Les commandes suivantes l'envoient au serveur grâce à `$headersA`. Si le jeton expire, refaites ce bloc pour vous reconnecter.

### B. Créer un rapport pour A

```powershell
$body = @{
  date = (Get-Date -Format 'yyyy-MM-dd')
  site = 'École du quartier'
  notes = 'Coffrage terminé'
  entries = @(
    @{ workerName = 'Samir'; hours = 7.25 }
    @{ workerName = 'Julie'; hours = 6 }
  )
} | ConvertTo-Json -Depth 4

$rapportA = Invoke-RestMethod "$base/reports" -Method Post -Headers $headersA -ContentType $typeJson -Body $body

$rapportA
```

Le résultat contient l'identifiant du nouveau rapport, par exemple `id : 1`. Ce numéro peut être différent si des rapports ont déjà été créés. Il est gardé dans `$rapportA.id` pour la suite.

### C. Lire la liste et le détail

Pour afficher tous les rapports du contremaître connecté :

```powershell
Invoke-RestMethod "$base/reports" -Headers $headersA | ConvertTo-Json -Depth 5
```

Pour afficher le rapport créé à l'étape B, avec ses lignes et son total :

```powershell
Invoke-RestMethod "$base/reports/$($rapportA.id)" -Headers $headersA | ConvertTo-Json -Depth 5
```

Vous devez retrouver Samir avec **7,25 heures**, Julie avec **6 heures** et `totalHours` égal à **13.25**. La commande utilise l'identifiant conservé dans `$rapportA.id` ; elle ne choisit pas automatiquement le dernier rapport.

### D. Vérifier que B ne peut pas lire le rapport de A

Connectez-vous avec le contremaître de B :

```powershell
$identifiantsB = @{
  email = 'foreman.b@example.com'
  password = 'Demo-chantier-2026!'
} | ConvertTo-Json

$connexionB = Invoke-RestMethod "$base/login" -Method Post -ContentType $typeJson -Body $identifiantsB

$headersB = @{
  Authorization = "Bearer $($connexionB.token)"
}
```

Demandez ensuite le même rapport, avec le compte de B :

```powershell
try {
  Invoke-RestMethod "$base/reports/$($rapportA.id)" -Headers $headersB -ErrorAction Stop
  Write-Host 'ÉCHEC : le compte B a pu lire le rapport de A.'
} catch {
  $statut = [int]$_.Exception.Response.StatusCode
  Write-Host "Statut reçu : $statut. Résultat attendu : 404."
}
```

Le résultat attendu est **404**. Ici, cette erreur confirme que le serveur refuse l'accès. Il répond comme si le rapport n'existait pas pour ne pas révéler les données d'une autre entreprise.

### E. Créer un rapport pour B et essayer dans l'autre sens

Le contenu du rapport peut être le même ; c'est le compte connecté qui détermine son entreprise :

```powershell
$rapportB = Invoke-RestMethod "$base/reports" -Method Post -Headers $headersB -ContentType $typeJson -Body $body

Invoke-RestMethod "$base/reports/$($rapportB.id)" -Headers $headersB | ConvertTo-Json -Depth 5
```

B doit pouvoir lire son rapport. Essayez maintenant avec A :

```powershell
try {
  Invoke-RestMethod "$base/reports/$($rapportB.id)" -Headers $headersA -ErrorAction Stop
  Write-Host 'ÉCHEC : le compte A a pu lire le rapport de B.'
} catch {
  $statut = [int]$_.Exception.Response.StatusCode
  Write-Host "Statut reçu : $statut. Résultat attendu : 404."
}
```

Le résultat attendu est encore **404**. Les tests automatisés couvrent aussi le cas de deux contremaîtres au sein de A, ainsi que les droits des admins.

## 5. Si le lancement bloque

| Ce qui apparaît | Quoi faire |
| --- | --- |
| `docker` n'est pas reconnu | Vérifiez que Docker Desktop est installé, puis rouvrez PowerShell. |
| Impossible de joindre le moteur Docker | Ouvrez Docker Desktop et attendez la fin de son démarrage. |
| Le port 3000 est déjà utilisé | Arrêtez l'autre copie de l'API, par exemple avec Ctrl+C dans sa fenêtre, puis relancez. |
| Le fichier de configuration Compose est introuvable | Ouvrez PowerShell dans le dossier qui contient `compose.yaml`. |
| Réponse 401 | Reconnectez-vous et recréez les en-têtes avec le nouveau jeton. |
| Réponse 404 pendant le test A/B | C'est le résultat attendu pour un rapport d'une autre entreprise. |
| Les accents du rapport s'affichent mal | Utilisez les blocs ci-dessus avec `$typeJson`, qui précise l'encodage UTF-8. |

Pour voir les derniers messages du serveur, depuis le dossier du projet :

```powershell
docker compose logs --tail 30 api
```

## 6. Les routes disponibles

Toutes les routes ci-dessous, sauf `/login`, demandent un jeton dans l'en-tête `Authorization: Bearer <jeton>`.

| Méthode et chemin | Ce que la route fait | Qui peut l'utiliser |
| --- | --- | --- |
| `POST /login` | Vérifie le courriel et le mot de passe, puis renvoie `token` et `expiresAt`. | Tout le monde peut tenter une connexion. |
| `POST /reports` | Crée un rapport et ses lignes, puis renvoie son `id`. | Un contremaître. |
| `GET /reports` | Liste les rapports accessibles, du plus récent au plus ancien selon leur date. | Le contremaître voit les siens ; l'admin voit ceux de son entreprise. |
| `GET /reports/:id` | Donne le détail d'un rapport, ses lignes et `totalHours`. | Les mêmes droits que pour la liste. |

Pour créer un rapport, le corps JSON contient :

| Champ | Règle |
| --- | --- |
| `date` | Une date réelle au format `AAAA-MM-JJ`. |
| `site` | Le nom du chantier, de 1 à 200 caractères après retrait des espaces aux extrémités. |
| `notes` | Facultatif, 5 000 caractères maximum. |
| `entries` | De 1 à 100 lignes d'heures. |
| `entries[].workerName` | Le nom du travailleur, de 1 à 120 caractères après retrait des espaces aux extrémités. |
| `entries[].hours` | Un nombre entre 0 et 24 inclus, avec au maximum deux décimales. |

Les propriétés inconnues sont refusées. L'entreprise et l'auteur ne sont pas des champs à envoyer : le serveur les retrouve à partir du compte connecté.

Le détail d'un rapport contient `id`, `companyId`, `foremanId`, `date`, `site`, `notes`, `entries` et `totalHours`. Chaque ligne contient son propre `id`, `workerName` et `hours`. La liste reprend les champs du rapport sans les lignes ni le total.

Les principaux codes de réponse sont : **200** pour une lecture ou connexion réussie, **201** pour une création, **400** pour des données incorrectes, **401** pour un problème de jeton ou d'identifiants, **403** pour une création interdite à un admin et **404** pour un rapport absent ou inaccessible. Un corps dépassant 64 Ko donne **413**. Une erreur interne donne **500**, sans exposer les détails techniques au client.

## 7. Mes choix et les points que j'ai supposés

- **SQLite pour ce petit projet.** La base tient dans un fichier et se lance avec l'API, ce qui simplifie l'essai. Pour un service utilisé par plusieurs instances du serveur, je passerais à PostgreSQL.
- **TypeScript et Zod.** TypeScript m'aide à repérer les erreurs dans le code. Zod vérifie les données reçues, par exemple une date impossible ou des heures négatives.
- **Un jeton aléatoire plutôt qu'un JWT.** L'énoncé demande un jeton sans imposer son format. Celui-ci expire après une heure ; seule son empreinte SHA-256 est enregistrée. Le rôle et l'entreprise sont relus en base à chaque demande.
- **Une séparation vérifiée côté serveur.** Chaque lecture filtre sur l'entreprise du compte. Un contremaître doit aussi être l'auteur du rapport. Même un admin reste limité à son entreprise. À la création, le serveur choisit l'entreprise et l'auteur depuis la session.
- **Une protection supplémentaire dans la base.** Une clé étrangère vérifie que le rapport et son auteur appartiennent à la même entreprise. Les valeurs des requêtes SQL sont passées comme paramètres pour éviter qu'une entrée soit interprétée comme du SQL.
- **Un rapport enregistré en entier.** Le rapport et ses lignes sont créés dans une transaction : si une ligne échoue, toute la création est annulée.
- **Des heures stockées en centièmes.** Par exemple, 7,25 heures deviennent 725 en base. Le total est additionné avec ces entiers, puis divisé par 100. Cela évite les petites erreurs d'addition des nombres décimaux. Il s'agit de centièmes d'heure, pas de minutes.
- **L'admin consulte mais ne crée pas.** L'énoncé réserve la création au contremaître. J'ai donc gardé cette distinction, y compris pour le détail d'un rapport.
- **Quelques règles métier restent ouvertes.** Les notes sont facultatives, les dates futures sont acceptées et plusieurs rapports peuvent exister à la même date sur le même chantier. Deux noms identiques ne sont pas considérés comme un travailleur unique. Sans règle plus précise, je n'ai pas imposé de plafond quotidien entre plusieurs lignes ou rapports.

Pour rester dans le temps de l'exercice, je n'ai pas ajouté de gestion des comptes, de réinitialisation des mots de passe ou de pagination. La création des tables se fait au démarrage. SQLite et le calcul scrypt sont synchrones : ce fonctionnement suffit pour l'essai, mais mérite d'être revu avant une utilisation avec beaucoup de demandes simultanées. En production, les connexions passeraient aussi par HTTPS.

## 8. Où trouver le code ?

| Fichier | Contenu |
| --- | --- |
| `src/database.ts` | Les tables, le calcul des empreintes de mots de passe et les comptes de départ. |
| `src/app.ts` | Les routes, la validation, la connexion et les droits d'accès. |
| `src/server.ts` | Le démarrage de l'API et l'ouverture du fichier SQLite. |
| `tests/api.test.ts` | Les 12 tests automatisés. |
| `Dockerfile` | La préparation de l'environnement pour l'API et les tests. |
| `compose.yaml` | Le lancement de l'API, son port et le volume qui conserve la base. |
| `.github/workflows/tests.yml` | Les vérifications lancées par GitHub Actions. |

## 9. Lancer sans Docker, pour travailler sur le code

Cette option demande Node.js **22.13 ou plus récent dans la branche 22**, avec npm. Pour simplement essayer le projet, les instructions Docker du début suffisent.

Dans PowerShell, depuis le dossier du projet :

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build
$env:SEED_DEMO = 'true'
npm.cmd start
```

Pour le développement, `npm.cmd run dev` peut remplacer la compilation et le démarrage, une fois les dépendances installées et `SEED_DEMO` défini. Sur Linux ou macOS, utilisez `npm` à la place de `npm.cmd` et `SEED_DEMO=true npm start` après la compilation.

| Variable facultative | Valeur par défaut sans Docker | Rôle |
| --- | --- | --- |
| `PORT` | `3000` | Le port sur lequel écoute l'API. |
| `DB_PATH` | `./data/reports.sqlite` | L'emplacement du fichier SQLite. |
| `SEED_DEMO` | Désactivé | Mettre `true` pour créer les comptes de démonstration. Docker Compose le fait déjà. |

La base locale et celle de Docker sont séparées : les rapports et jetons de l'une ne sont pas automatiquement présents dans l'autre. Arrêtez la première API avant de lancer l'autre sur le même port.

## 10. Vérifications réalisées

La construction et le démarrage avec Docker Compose ont été vérifiés. Les 12 tests, le contrôle TypeScript et la compilation ont réussi dans Docker. L'API du conteneur a aussi passé 14 groupes de vérification par de vraies requêtes HTTP : connexion des quatre comptes, création, totaux, accents, droits, séparation entre A et B et réponses aux données incorrectes. Les rapports et sessions étaient toujours présents après suppression puis recréation du conteneur en conservant son volume.

Le workflow GitHub Actions a également été exécuté avec succès sur GitHub : installation des dépendances, contrôle TypeScript, tests et compilation. Le [résultat de cette exécution est consultable ici](https://github.com/aminema123/1entrer-exercice/actions/runs/44909781511). Le fichier `.github/workflows/tests.yml` relance ces vérifications à chaque push ou pull request.

## 11. Questions écrites

### 1. Comment mettre cette API en production sur AWS pour environ 60 entreprises ?

Je garderais Docker et ferais tourner l'API sur ECS Fargate, pour éviter d'avoir des serveurs à administrer directement. L'image serait stockée dans ECR. Un équilibreur de charge, Application Load Balancer, recevrait les demandes en HTTPS et les transmettrait à l'API.

Je remplacerais SQLite par PostgreSQL sur RDS, accessible seulement depuis le réseau privé. Il faudrait adapter le code et prévoir les changements du schéma de la base. Les filtres par entreprise resteraient obligatoires. Les mots de passe de connexion aux services seraient dans Secrets Manager. Je choisirais la capacité selon les utilisateurs actifs et la charge mesurée ; le nombre d'entreprises seul ne suffit pas. Si la disponibilité le demande, je prévoirais deux instances de l'API et RDS Multi-AZ.

Pour les mises à jour, les tests passeraient avant la publication d'une image versionnée, essayée en préproduction puis déployée progressivement. Je garderais un retour possible à la version précédente et des changements de base compatibles. J'activerais les sauvegardes automatiques RDS avec une durée de conservation convenue et des essais de restauration. CloudWatch regrouperait les journaux et alerterait l'équipe sur les erreurs, la lenteur et les problèmes de ressources.

### 2. Plusieurs contremaîtres de A ne peuvent plus se connecter : que faire dans les 30 premières minutes ?

**0 à 5 minutes :** je confirme la prise en charge au contact de A et demande le message exact, l'heure et les comptes touchés, sans demander les mots de passe. J'avertis le responsable technique et le support dans le canal d'incident de l'équipe. Je précise au client quand je lui donnerai des nouvelles.

**5 à 15 minutes :** je vérifie si le problème touche seulement A ou d'autres entreprises. Je regarde l'état de l'API, les erreurs de connexion, l'accès à la base et les derniers changements. Je distingue un mot de passe refusé d'une erreur du serveur ou d'une absence de réponse. J'essaie de reproduire avec un compte de test autorisé.

**15 à 25 minutes :** selon les observations, j'applique une correction réversible. Si le dernier déploiement est en cause, je reviens à la version précédente. Je demande de l'aide au responsable ou à la personne chargée de l'infrastructure si nécessaire, sans contourner les règles d'accès.

**25 à 30 minutes :** je vérifie le retour du service avec le contact de A et je surveille les erreurs. Même sans résolution, je donne un point de situation au client et à l'équipe. Je note les actions pour préparer l'analyse de la panne.

### 3. Qu'aurais-je fait différemment avec plus de temps ?

Je commencerais par limiter les tentatives de connexion et rendre le calcul des mots de passe asynchrone pour éviter qu'il bloque les autres demandes. J'ajouterais une pagination pour les listes, des changements de base versionnés et des journaux plus faciles à suivre lors d'une panne.

Je compléterais les tests avec de la charge et un démarrage Docker automatique dans GitHub Actions. Pour plusieurs instances de l'API, je passerais à PostgreSQL. J'ajouterais aussi la déconnexion et la révocation des sessions, puis une procédure de sauvegarde avec des essais de restauration.

Enfin, je demanderais au métier s'il faut limiter le nombre de rapports par jour et comment identifier les travailleurs pour contrôler le cumul de leurs heures. Ces règles auraient besoin d'être précisées avant de les ajouter au code.
