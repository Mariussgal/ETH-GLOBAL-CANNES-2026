# YSM — Plan d'intégration CRE (Simulation locale → Onchain)
## Document de travail · À donner à une IA pour être guidé étape par étape

---

## CONTEXTE DU PROJET

Tu aides l'équipe YSM (Yield Stream Marketplace) à intégrer Chainlink CRE dans leurs smart contracts Solidity pour ETHGlobal Cannes 2026.

**Le problème :** Les comptes CRE ne sont pas encore approuvés pour le déploiement réseau. La solution : faire tourner les workflows en **simulation locale** via `cre workflow simulate`. En simulation, le workflow fait de vrais appels réseau (DeFiLlama, Sepolia) mais tourne sur la machine locale. Il écrit onchain via un `MockKeystoneForwarder` déjà déployé par Chainlink sur Sepolia.

**L'objectif de ce plan :** Modifier les contrats Solidity existants pour qu'ils reçoivent les résultats des workflows CRE, et aligner le format des données entre P1 (Solidity) et P2 (TypeScript CRE).

---

## LES DEUX PERSONNES

- **P1** = développeur smart contracts (Solidity, Hardhat, Sepolia). C'est l'utilisateur que tu guides.
- **P2** = développeur backend/Chainlink (TypeScript, CRE SDK). Il travaille en parallèle. P1 doit lui communiquer certaines infos précises.

---

## ADRESSES IMPORTANTES (Ethereum Sepolia)

```
MockKeystoneForwarder (simulation) : 0x15fC6ae953E024d975e77382eEeC56A9101f9F88
KeystoneForwarder (production)     : 0xF8344CFd5c43616a4366C34E3EEE75af79a74482

StreamFactory déployée             : 0x281d58aeF1e47a9ac842c1558e85eb674DaAcca4
MasterSettler déployé              : 0xFE6B4a8Ae90C47dA0E19296CaeBb2FF8D313954f
YSTSplitter (demo)                 : 0x7e07451B69dc3A92f678Df6Cc37272043178447e
MockProtocol                       : 0x5884DE6070F71EF8e4FdC9F3D5341a941ae4c29b
USDC Circle Sepolia                : 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

---

## COMMENT FONCTIONNE LE MÉCANISME CRE → ONCHAIN

```
[Workflow CRE tourne en local]
         ↓
[Appels DeFiLlama + Price Feed → calcul]
         ↓
[encode le résultat en ABI]
         ↓
[EVM Write → MockKeystoneForwarder sur Sepolia]
         ↓
[MockForwarder appelle onReport(metadata, report) sur ton contrat]
         ↓
[_processReport(report) → ta logique métier]
```

Les contrats doivent implémenter l'interface `IReceiver` avec la fonction `onReport`. Le pattern recommandé est d'hériter de `ReceiverTemplate` (fourni par Chainlink) et d'implémenter uniquement `_processReport`.

---

## LES 3 WORKFLOWS ET LEURS RECEIVERS

| Workflow | Déclencheur | Receiver (contrat cible) | Responsable |
|----------|------------|--------------------------|-------------|
| Workflow #1 — Calcul décote | Création de stream | StreamFactory | P1 modifie, P2 encode |
| Workflow #2 — Gate émetteur | Création de stream | StreamFactory | P1 modifie, P2 encode |
| Workflow #3 — Settlement daily | Cron toutes les 10min (démo) | MasterSettler | P1 modifie, P2 encode |

---

## ÉTAPE 1 — [P1] Ajouter ReceiverTemplate dans le repo

**Qui :** P1  
**Quand :** En premier, avant toute modification de contrat

### 1a. Installer les dépendances

Vérifier si `@chainlink/contracts` est déjà installé :
```bash
cat package.json | grep chainlink
```

Si absent :
```bash
npm install @chainlink/contracts
```

Vérifier que OpenZeppelin est présent (pour `Ownable`) :
```bash
cat package.json | grep openzeppelin
```

### 1b. Copier les interfaces nécessaires dans `contracts/`

Créer `contracts/interfaces/IReceiver.sol` :
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IReceiver is IERC165 {
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external;
}
```

Créer `contracts/ReceiverTemplate.sol` : copier le code source complet depuis
https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
(section "3.2 Contract Source Code")

### Checklist étape 1
- [ ] `@chainlink/contracts` installé OU fichiers copiés manuellement
- [ ] `contracts/interfaces/IReceiver.sol` présent
- [ ] `contracts/ReceiverTemplate.sol` présent
- [ ] `npx hardhat compile` passe sans erreur sur ces fichiers

---

## ÉTAPE 2 — [P1] Modifier StreamFactory.sol

**Qui :** P1  
**Quand :** Après étape 1  
**Impact :** Redéploiement requis (nouvelle adresse)

### Contexte
StreamFactory reçoit deux workflows distincts (#1 décote et #2 gate). Le même `onReport` est appelé dans les deux cas. Le dispatcher utilise un `uint8 workflowType` encodé en premier dans le report par P2.

### Modifications à apporter

**Supprimer :**
```solidity
// SUPPRIMER ces lignes
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";

contract StreamFactory is FunctionsClient {
    function fulfillRequest(
        bytes32 requestId, 
        bytes memory response, 
        bytes memory err
    ) internal override {}
}
```

**Ajouter :**
```solidity
// AJOUTER cet import
import {ReceiverTemplate} from "./ReceiverTemplate.sol";

// MODIFIER la déclaration du contrat
contract StreamFactory is ReceiverTemplate {

    // Variables de stockage des résultats CRE
    uint256 public lastComputedDiscount;   // résultat Workflow #1, en basis points (3000 = 30%)
    bool public lastGateApproved;          // résultat Workflow #2
    bytes32 public pendingStreamId;        // stream en attente de validation

    // MODIFIER le constructor
    constructor(address _mockForwarder) ReceiverTemplate(_mockForwarder) {
        // ... reste du constructor existant inchangé
    }

    // AJOUTER _processReport
    function _processReport(bytes calldata report) internal override {
        (uint8 workflowType, bytes memory payload) = abi.decode(report, (uint8, bytes));
        
        if (workflowType == 1) {
            _handleDiscountResult(payload);
        } else if (workflowType == 2) {
            _handleGateResult(payload);
        }
    }

    function _handleDiscountResult(bytes memory payload) internal {
        uint256 discount = abi.decode(payload, (uint256));
        lastComputedDiscount = discount;
        emit DiscountComputed(discount);
    }

    function _handleGateResult(bytes memory payload) internal {
        bool approved = abi.decode(payload, (bool));
        lastGateApproved = approved;
        emit GateResultReceived(approved);
    }

    // AJOUTER les events
    event DiscountComputed(uint256 discount);
    event GateResultReceived(bool approved);
}
```

### Checklist étape 2
- [ ] Import `FunctionsClient` supprimé
- [ ] Héritage `FunctionsClient` remplacé par `ReceiverTemplate`
- [ ] `fulfillRequest` supprimé
- [ ] Constructor prend `address _mockForwarder` (plus `address _functionsRouter`)
- [ ] `_processReport` implémenté avec dispatcher `workflowType`
- [ ] `_handleDiscountResult` et `_handleGateResult` implémentés
- [ ] Events `DiscountComputed` et `GateResultReceived` ajoutés
- [ ] `npx hardhat compile` passe sans erreur

---

## ÉTAPE 3 — [P1] Modifier MasterSettler.sol

**Qui :** P1  
**Quand :** Après étape 1, en parallèle de l'étape 2  
**Impact :** Redéploiement requis (nouvelle adresse)

### Modifications à apporter

```solidity
// AJOUTER cet import
import {ReceiverTemplate} from "./ReceiverTemplate.sol";

// MODIFIER la déclaration
contract MasterSettler is ReceiverTemplate {

    // MODIFIER le constructor
    constructor(address _mockForwarder) ReceiverTemplate(_mockForwarder) {}

    // AJOUTER _processReport
    function _processReport(bytes calldata report) internal override {
        // Workflow #3 envoie un report vide — on exécute juste le settlement
        performUpkeep("");
    }

    // GARDER checkUpkeep et performUpkeep INCHANGÉS
    // performUpkeep DOIT rester PUBLIC (pas internal) pour le backup manuel de démo
    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory) {
        // ... logique existante inchangée
    }

    function performUpkeep(bytes calldata) public {
        // ... logique existante inchangée
    }
}
```

### Checklist étape 3
- [ ] Héritage `ReceiverTemplate` ajouté
- [ ] Constructor prend `_mockForwarder`
- [ ] `_processReport` appelle `performUpkeep("")`
- [ ] `performUpkeep` reste `public` (pas `internal` ni `external`)
- [ ] `checkUpkeep` et `performUpkeep` logique inchangée
- [ ] `npx hardhat compile` passe sans erreur

---

## ÉTAPE 4 — [P1] Redéployer StreamFactory et MasterSettler

**Qui :** P1  
**Quand :** Après que les deux contrats compilent sans erreur

### Commandes de déploiement

Mettre à jour le script de déploiement Hardhat pour passer le MockForwarder :
```javascript
// deploy/deployStreamFactory.js
const MOCK_FORWARDER = "0x15fC6ae953E024d975e77382eEeC56A9101f9F88";

const streamFactory = await StreamFactory.deploy(MOCK_FORWARDER);
await streamFactory.deployed();
console.log("StreamFactory:", streamFactory.address);
```

```javascript
// deploy/deployMasterSettler.js
const MOCK_FORWARDER = "0x15fC6ae953E024d975e77382eEeC56A9101f9F88";

const masterSettler = await MasterSettler.deploy(MOCK_FORWARDER);
await masterSettler.deployed();
console.log("MasterSettler:", masterSettler.address);
```

Déployer et vérifier :
```bash
npx hardhat run deploy/deployStreamFactory.js --network sepolia
npx hardhat verify --network sepolia <NOUVELLE_ADRESSE_STREAM_FACTORY> "0x15fC6ae953E024d975e77382eEeC56A9101f9F88"

npx hardhat run deploy/deployMasterSettler.js --network sepolia
npx hardhat verify --network sepolia <NOUVELLE_ADRESSE_MASTER_SETTLER> "0x15fC6ae953E024d975e77382eEeC56A9101f9F88"
```

### Checklist étape 4
- [ ] StreamFactory redéployée → noter la nouvelle adresse
- [ ] MasterSettler redéployé → noter la nouvelle adresse
- [ ] Les deux contrats vérifiés sur Etherscan (source code visible)
- [ ] `getForwarderAddress()` retourne bien `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (vérifiable sur Etherscan → Read Contract)

---

## ÉTAPE 5 — [P1 → P2] Partager les nouvelles adresses et le format d'encoding

**Qui :** P1 envoie à P2  
**Quand :** Immédiatement après l'étape 4

### Message exact à envoyer à P2

```
Nouvelles adresses Sepolia après migration CRE :

StreamFactory : <NOUVELLE_ADRESSE>
MasterSettler : <NOUVELLE_ADRESSE>

Format d'encoding des reports à utiliser dans les Workflows TypeScript :

Workflow #1 (décote) :
  workflowType = 1 (uint8)
  payload = abi.encode(uint256 discount) en basis points (3000 = 30.00%)
  report final = abi.encode(uint8(1), bytes(payload))

Workflow #2 (gate) :
  workflowType = 2 (uint8)
  payload = abi.encode(bool approved)
  report final = abi.encode(uint8(2), bytes(payload))

Workflow #3 (settlement) :
  report = "0x" (vide)

MockForwarder Sepolia pour la config CRE : 0x15fC6ae953E024d975e77382eEeC56A9101f9F88

Mettre à jour receiver_address dans config.json des 3 workflows avec les nouvelles adresses.
```

### Checklist étape 5
- [ ] Nouvelles adresses communiquées à P2
- [ ] Format d'encoding aligné (basis points pour la décote, bool pour la gate)
- [ ] P2 confirme avoir mis à jour ses `config.json` avec les nouvelles adresses
- [ ] P3 notifié pour mettre à jour `contracts/index.ts`

---

## ÉTAPE 6 — [P2] Encoder les reports dans les Workflows TypeScript

**Qui :** P2 (fourni ici pour référence et vérification par P1)  
**Quand :** En parallèle des étapes 2-4

### Ce que P2 doit coder dans chaque Workflow

**Workflow #1 (décote) :**
```typescript
import { ethers } from "ethers";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

// discount en basis points : 3000 = 30.00%
const discount: number = Math.round(computedDiscount * 10000); // ex: 0.30 → 3000

const innerPayload = abiCoder.encode(["uint256"], [discount]);
const report = abiCoder.encode(["uint8", "bytes"], [1, innerPayload]);

// Passer `report` dans l'appel evm.write(...)
```

**Workflow #2 (gate) :**
```typescript
const approved: boolean = activeDays >= 60; // ex: protocole avec 65/90 jours actifs

const innerPayload = abiCoder.encode(["bool"], [approved]);
const report = abiCoder.encode(["uint8", "bytes"], [2, innerPayload]);
```

**Workflow #3 (settlement) :**
```typescript
const report = "0x"; // report vide
```

---

## ÉTAPE 7 — [P1] Tester end-to-end avec cre workflow simulate

**Qui :** P1 (ou P1 + P2 ensemble)  
**Quand :** Après que P2 a confirmé que ses Workflows compilent et que les adresses sont à jour

### Ordre des tests

**Test 1 — Workflow #2 gate (le plus simple à vérifier)**
```bash
cre workflow simulate --workflow workflow2-gate.yaml
```
Vérifier sur Etherscan → StreamFactory → Read Contract :
- `lastGateApproved` doit être `true` (avec un slug valide) ou `false` (avec un slug fictif)

**Test 2 — Workflow #1 décote**
```bash
cre workflow simulate --workflow workflow1-discount.yaml
```
Vérifier sur Etherscan → StreamFactory → Read Contract :
- `lastComputedDiscount` doit être un uint256 entre 1000 (10%) et 5000 (50%)

**Test 3 — Workflow #3 settlement**
```bash
cre workflow simulate --workflow workflow3-settlement.yaml
```
Vérifier sur Etherscan → MasterSettler → Events :
- Un event de settlement doit apparaître

### Checklist étape 7
- [ ] `simulate` Workflow #2 sans revert → état `lastGateApproved` changé onchain
- [ ] `simulate` Workflow #2 avec slug fictif → état `lastGateApproved = false`
- [ ] `simulate` Workflow #1 → état `lastComputedDiscount` mis à jour onchain
- [ ] `simulate` Workflow #3 → event settlement visible sur Etherscan
- [ ] Aucun revert `InvalidSender` (sinon : vérifier que le forwarder address est bien le MockForwarder)

---

## ERREURS FRÉQUENTES ET SOLUTIONS

| Erreur | Cause probable | Solution |
|--------|---------------|----------|
| `InvalidSender` au simulate | MockForwarder mal configuré dans le constructor | Vérifier `getForwarderAddress()` onchain |
| `abi decode failed` | Format d'encoding P2 ≠ decode P1 | Revalider le format avec P2 (basis points vs 1e18) |
| `WorkflowNameRequiresAuthorValidation` | `setExpectedWorkflowName` appelé sans `setExpectedAuthor` | Ne PAS configurer ces checks en simulation |
| Compile error `fulfillRequest` | Ancien héritage `FunctionsClient` pas entièrement supprimé | Vérifier tous les imports et l'héritage |
| `performUpkeep` ne s'exécute pas | Déclaré `internal` au lieu de `public` | Changer en `public` |

---

## RÉSUMÉ DES REDEPLOIEMENTS

| Contrat | Modification | Redéployer | Qui |
|---------|-------------|-----------|-----|
| StreamFactory | FunctionsClient → ReceiverTemplate + dispatcher | ✅ Oui | P1 |
| MasterSettler | + ReceiverTemplate, _processReport → performUpkeep | ✅ Oui | P1 |
| YSTVault | Aucune | ❌ Non | — |
| YSTSplitter | Aucune | ❌ Non | — |
| MockProtocol | Aucune | ❌ Non | — |

---

## FICHIER DE SUIVI DES ADRESSES (à mettre à jour en temps réel)

```
// contracts/addresses.ts — à partager avec P2 et P3

export const ADDRESSES = {
  // Inchangés
  YSTSplitter:   "0x7e07451B69dc3A92f678Df6Cc37272043178447e",
  MockProtocol:  "0x5884DE6070F71EF8e4FdC9F3D5341a941ae4c29b",
  USDC:          "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  
  // À mettre à jour après redéploiement
  StreamFactory: "NOUVELLE_ADRESSE_ICI",
  MasterSettler: "NOUVELLE_ADRESSE_ICI",
  
  // Infrastructure Chainlink
  MockForwarder: "0x15fC6ae953E024d975e77382eEeC56A9101f9F88",
};
```
