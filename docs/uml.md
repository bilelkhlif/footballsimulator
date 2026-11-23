# Diagrammes UML

Diagrammes de la version finale (sprint 6), demandés par le cahier des charges (§5.4 : cas d'utilisation, séquence, déploiement), complétés par un diagramme des classes principales. Ils sont écrits en Mermaid : GitHub les affiche directement.

## 1. Cas d'utilisation

```mermaid
flowchart LR
  coach(["👤 Entraîneur, joueur ou créateur de contenu"])
  jury(["👤 Jury"])
  subgraph app ["Football Simulator (PWA)"]
    uc1(["BF1 Démarrer une session AR"])
    uc2(["BF2 Voir le réticule sur la surface détectée"])
    uc3(["BF3 Poser le terrain d'un toucher"])
    uc4(["BF4 Choisir la formation de chaque équipe"])
    uc5(["BF5 Sélectionner puis déplacer un joueur"])
    uc6(["BF6 Déplacer le ballon"])
    uc7(["BF7 Tracer une flèche de passe ou de course"])
    uc8(["BF8 Annuler, rétablir, réinitialiser"])
    uc9(["BF9 Animer une action pas à pas (bonus)"])
    ucI(["Installer l'application, la lancer hors-ligne"])
    ucV(["Vue 3D sans AR (ordinateur, iPhone)"])
  end
  coach --- uc1 & uc4 & uc5 & uc6 & uc7 & uc8 & uc9 & ucI & ucV
  jury --- uc1 & uc9
  uc1 -.->|inclut| uc2
  uc2 -.->|inclut| uc3
  uc5 -.->|étend| uc8
  uc7 -.->|étend| uc8
```

## 2. Séquences

### 2.1 Poser le terrain (BF1 à BF3)

```mermaid
sequenceDiagram
  actor U as Utilisateur
  participant M as main.mjs
  participant S as ArSession (xr-session.mjs)
  participant N as Navigateur (WebXR, ARCore)
  participant P as SurfacePlacement (ar-surface.mjs)
  participant L as Boucle de rendu
  U->>M: « Entrer en AR »
  M->>S: start()
  S->>N: requestSession('immersive-ar', webgpu, local-floor, hit-test, anchors, dom-overlay)
  N-->>S: XRSession, espace local-floor
  S-->>M: sessionstart
  M->>P: start() : source de hit test depuis l'espace viewer
  loop chaque image (XRFrame)
    L->>P: update(frame) : getHitTestResults → réticule
  end
  U->>N: toucher l'écran
  N-->>M: select (routeXrSelect : terrain pas encore posé)
  M->>P: requestPlacement()
  L->>P: update(frame) : pose sur la surface, createAnchor
  P-->>M: statechange « placed » : formations, outils et séquence apparaissent
```

### 2.2 Déplacer un joueur (BF5), patron Command

```mermaid
sequenceDiagram
  actor U as Utilisateur
  participant X as XrTacticalInput / PointerInput
  participant I as TacticalInteraction
  participant H as CommandHistory
  participant B as TacticsBoard
  participant V as TacticalView
  U->>X: toucher un joueur
  X->>I: handleTap(rayon du targetRaySpace ou de la caméra)
  I->>I: pickTarget(zones de sélection) → joueur sélectionné
  U->>X: toucher une place du terrain
  X->>I: handleTap(rayon)
  I->>I: intersectPitchPlane → point dans le repère du terrain
  I->>H: execute(MovePlayerCommand)
  H->>B: setPlayerPosition(équipe, numéro, place)
  B-->>V: change (patron Observer)
  V->>V: animator.moveTo : le joueur glisse en 0,35 s
  U->>H: « Annuler »
  H->>B: undo : place d'avant
  B-->>V: change
```

### 2.3 Animer une action (BF9)

```mermaid
sequenceDiagram
  actor U as Utilisateur
  participant SP as Panneau de la séquence
  participant H as CommandHistory
  participant Q as TacticalSequence
  participant R as SequencePlayer
  participant L as Boucle de rendu
  participant B as TacticsBoard
  participant V as TacticalView
  U->>SP: « Image clé » (plusieurs fois, en déplaçant des joueurs entre deux)
  SP->>H: execute(AddKeyframeCommand)
  H->>Q: add(places des 22 joueurs et du ballon)
  U->>SP: « Lecture »
  SP->>R: play()
  loop chaque image
    L->>R: update(temps) : curseur += temps écoulé × vitesse
    R->>R: interpolation entre deux images clés, dans le repère du terrain
  end
  U->>H: une action (déplacement, « Annuler »…)
  H->>B: execute ou undo
  B-->>R: change (Observer) : stop()
  R->>V: returnToBoard() : la scène rejoint le tableau
```

## 3. Déploiement

```mermaid
flowchart LR
  subgraph phone ["Smartphone Android (ARCore)"]
    subgraph chrome ["Chrome"]
      page["Page : index.html, modules src/, three.js r187 (WebGPU)"]
      sw["Service Worker (sw.js)<br/>coquille à version de contenu"]
      cache[("Cache football-simulator-SHELL_VERSION<br/>(48 entrées de APP_SHELL)")]
      webxr["WebXR : immersive-ar, hit test, ancres,<br/>DOM Overlay, liaison WebXR/WebGPU"]
    end
    arcore["ARCore, caméra, processeur graphique"]
  end
  pages["GitHub Pages (HTTPS)<br/>bilelkhlif.github.io/footballsimulator"]
  pages -->|première visite, mises à jour| sw
  sw <--> cache
  sw -->|réponses| page
  page <--> webxr
  webxr <--> arcore
  pc["PC (développement et tests)<br/>Chrome, émulateur IWER (?iwer), npm test"] -.->|même code| pages
```

## 4. Classes principales

```mermaid
classDiagram
  class EventEmitter {
    +on(type, observateur)
    +off(type, observateur)
    +emit(type, détail)
  }
  class TacticsBoard {
    +getFormation(équipe)
    +setFormation(équipe, nom)
    +getPlayerPosition(équipe, numéro)
    +setPlayerPosition(équipe, numéro, place)
    +addArrow(flèche)
    +snapshot()
    +restore(instantané)
  }
  class FormationStrategy {
    <<Strategy>>
    +name
    +lines
    +computePositions()
  }
  class Formation442
  class Formation433
  class Formation352
  class Formation4231
  class PlayerFactory {
    <<Factory>>
    +createPlayer(équipe, numéro, poste)
    +createTeamMeshes(équipe, joueurs)
  }
  class TeamMeshes {
    +update()
  }
  class Command {
    <<Command>>
    +execute() bool
    +undo()
  }
  class CommandHistory {
    +execute(commande)
    +undo()
    +redo()
  }
  class TacticalInteraction {
    +handleTap(rayon)
    +hover(rayon)
    +setMode(mode)
  }
  class TacticalView {
    +sync()
    +update()
    +returnToBoard()
  }
  class TacticalSequence
  class SequencePlayer {
    +play()
    +pause()
    +restart()
    +stop()
    +update(temps)
  }
  class ArSession
  class SurfacePlacement {
    +pitchReady
    +update(XRFrame)
  }
  class XrTacticalInput {
    +handleSelect(événement)
    +update(XRFrame)
  }
  EventEmitter <|-- TacticsBoard
  EventEmitter <|-- CommandHistory
  EventEmitter <|-- TacticalInteraction
  EventEmitter <|-- TacticalSequence
  EventEmitter <|-- SequencePlayer
  EventEmitter <|-- ArSession
  EventEmitter <|-- SurfacePlacement
  FormationStrategy <|-- Formation442
  FormationStrategy <|-- Formation433
  FormationStrategy <|-- Formation352
  FormationStrategy <|-- Formation4231
  Command <|-- MovePlayerCommand
  Command <|-- MoveBallCommand
  Command <|-- AddArrowCommand
  Command <|-- ChangeFormationCommand
  Command <|-- ResetBoardCommand
  Command <|-- AddKeyframeCommand
  Command <|-- ClearSequenceCommand
  TacticsBoard --> FormationStrategy : formation de chaque équipe
  CommandHistory o-- Command
  TacticalInteraction --> CommandHistory : crée les commandes
  TacticalView ..> TacticsBoard : observe
  PlayerFactory ..> TeamMeshes : crée
  SequencePlayer --> TacticalSequence : lit
  SequencePlayer ..> TacticsBoard : s'arrête à chaque changement
  XrTacticalInput --> TacticalInteraction : rayons
```
