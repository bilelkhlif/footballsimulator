/**
 * Annotations dessinées sur la vidéo : une ellipse au pied de chaque personne suivie, à la couleur
 * de son équipe, son identifiant de suivi, et un repère au-dessus du ballon.
 *
 * Le dessin se fait sur un canvas 2D transparent, posé sur l'image de la vidéo : les boîtes de
 * l'analyse (en pixels de la vidéo source) sont mises à l'échelle de l'image affichée, bandes
 * noires comprises (object-fit: contain). Un clic sur une personne la sélectionne.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Couleurs sans équipe : arbitre, équipe inconnue, sélection. */
export const ANNOTATION_COLORS = Object.freeze({ referee: '#202327', unknown: '#9aa0a6', selected: '#f4c542', ball: '#f4c542' });

/**
 * Rectangle de l'image dans un lecteur vidéo en object-fit: contain.
 * @param {{width: number, height: number}} element taille du lecteur, en pixels CSS
 * @param {{width: number, height: number}} video dimensions de la vidéo
 * @returns {{x: number, y: number, width: number, height: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — annotations sur la vidéo
 */
export function containRect(element, video) {
  if (!video.width || !video.height || !element.width || !element.height) {
    return { x: 0, y: 0, width: element.width, height: element.height };
  }
  const scale = Math.min(element.width / video.width, element.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { x: (element.width - width) / 2, y: (element.height - height) / 2, width, height };
}

/**
 * Convertit une boîte de la vidéo source en rectangle d'affichage.
 * @param {number[]} box [x1, y1, x2, y2] en pixels de la vidéo source
 * @param {{x: number, y: number, width: number, height: number}} content image affichée
 * @param {{width: number, height: number}} source dimensions de la vidéo source
 * @returns {{x: number, y: number, width: number, height: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — annotations sur la vidéo
 */
export function boxToDisplay(box, content, source) {
  const sx = content.width / source.width;
  const sy = content.height / source.height;
  return { x: content.x + box[0] * sx, y: content.y + box[1] * sy, width: (box[2] - box[0]) * sx, height: (box[3] - box[1]) * sy };
}

/**
 * Couleur d'une personne : son équipe, ou la couleur neutre de son groupe.
 * @param {{role: string, team: number|null}} object
 * @param {(team: number) => string|null} teamColor
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — annotations sur la vidéo
 */
export function annotationColor(object, teamColor) {
  if (object.role === 'referee') {
    return ANNOTATION_COLORS.referee;
  }
  return (object.team === 0 || object.team === 1 ? teamColor(object.team) : null) ?? ANNOTATION_COLORS.unknown;
}

/**
 * Calque d'annotations de la vidéo.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — annotations sur la vidéo
 */
export class VideoAnnotations {
  /**
   * @param {HTMLCanvasElement} canvas calque posé sur le lecteur vidéo, de même taille
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — annotations sur la vidéo
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    /** @type {{id: number, rect: object}[]} boîtes dessinées, pour la sélection au clic */
    this.drawn = [];
  }

  /**
   * Adapte le calque à la taille du lecteur.
   * @param {number} width en pixels CSS
   * @param {number} height en pixels CSS
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — annotations sur la vidéo
   */
  resize(width, height) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
  }

  /**
   * Dessine les annotations d'un instant.
   * @param {{objects: object[], ball: object|null}} sample
   * @param {object} options
   * @param {{x: number, y: number, width: number, height: number}} options.content image affichée
   * @param {{width: number, height: number}} options.source dimensions de la vidéo source
   * @param {(team: number) => string|null} options.teamColor
   * @param {number|null} options.selectedId
   * @param {boolean} options.visible faux pour masquer les annotations
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — annotations sur la vidéo
   */
  draw(sample, { content, source, teamColor, selectedId, visible = true }) {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawn = [];
    if (!visible) {
      return;
    }
    ctx.font = '600 11px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const object of sample.objects) {
      const rect = boxToDisplay(object.box, content, source);
      this.drawn.push({ id: object.id, rect });
      const selected = object.id === selectedId;
      const color = annotationColor(object, teamColor);
      const footX = rect.x + rect.width / 2;
      const footY = rect.y + rect.height;
      ctx.lineWidth = selected ? 3.5 : 2;
      ctx.strokeStyle = selected ? ANNOTATION_COLORS.selected : color;
      ctx.setLineDash(object.team === null && object.role !== 'referee' ? [4, 3] : []);
      ctx.beginPath();
      ctx.ellipse(footX, footY, Math.max(rect.width * 0.55, 6), Math.max(rect.width * 0.18, 2.5), 0, -0.25 * Math.PI, 1.25 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = object.role === 'goalkeeper' ? `G${object.id}` : object.role === 'referee' ? 'A' : String(object.id);
      const labelWidth = ctx.measureText(label).width + 10;
      ctx.fillStyle = selected ? ANNOTATION_COLORS.selected : color;
      ctx.beginPath();
      ctx.roundRect(footX - labelWidth / 2, footY + 5, labelWidth, 15, 4);
      ctx.fill();
      ctx.fillStyle = selected ? '#111' : '#fff';
      ctx.fillText(label, footX, footY + 12.5);
    }
    if (sample.ball) {
      const rect = boxToDisplay(sample.ball.box, content, source);
      const x = rect.x + rect.width / 2;
      const y = rect.y - 4;
      ctx.fillStyle = ANNOTATION_COLORS.ball;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7, y - 11);
      ctx.lineTo(x + 7, y - 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Personne sous un point du calque : la boîte la plus petite qui le contient.
   * @param {number} x en pixels CSS, relatif au calque
   * @param {number} y
   * @returns {number|null} identifiant de suivi
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — annotations sur la vidéo
   */
  pick(x, y) {
    let best = null;
    for (const { id, rect } of this.drawn) {
      const inside = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height + 18;
      if (inside && (!best || rect.width * rect.height < best.area)) {
        best = { id, area: rect.width * rect.height };
      }
    }
    return best?.id ?? null;
  }
}
