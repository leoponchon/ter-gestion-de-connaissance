export const TRAPS = [
  {
    id: "trap1",
    terme_source: "chauve-souris",
    type_relation: "r_isa",
    terme_cible: "oiseau",
    reponse_attendue: "faux"
  },
  {
    id: "trap2",
    terme_source: "tomate",
    type_relation: "r_isa",
    terme_cible: "legume",
    reponse_attendue: "faux"
  },
  {
    id: "trap3",
    terme_source: "chien",
    type_relation: "r_isa",
    terme_cible: "animal",
    reponse_attendue: "vrai"
  },
  {
    id: "trap4",
    terme_source: "avocat",
    type_relation: "r_carac",
    terme_cible: "poils",
    reponse_attendue: "faux"
  },
  {
    id: "trap5",
    terme_source: "feu",
    type_relation: "r_carac",
    terme_cible: "froid",
    reponse_attendue: "faux"
  },
  {
    id: "trap6",
    terme_source: "sous-marin",
    type_relation: "r_isa",
    terme_cible: "bateau",
    reponse_attendue: "vrai"
  }
];

export function getRandomTrap() {
  const randomIndex = Math.floor(Math.random() * TRAPS.length);
  return TRAPS[randomIndex];
}
