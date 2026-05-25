export default function readyHandler(client) {
  client.once("clientReady", async () => {
    console.log(`${client.user.tag} prêt à discuter !`);
    client.user.setActivity("Discute avec les utilisateurs !");

    try {
      const commands = [
        {
          name: "maj",
          description: "Indique la date de la dernière mise à jour du bot"
        },
        {
          name: "help",
          description: "Affiche l'aide et explique le fonctionnement du bot"
        },
        {
          name: "trust",
          description: "Indique ton score de fiabilité"
        },
        {
          name: "chat",
          description: "Engage une conversation avec le bot",
          options: [
            {
              name: "question",
              type: 3, // string en gros
              description: "La question que tu veux poser",
              required: true
            }
          ]
        },
        {
          name: "export",
          description: "Exporte toutes les relations locales de la base de données au format Markdown"
        },
        {
          name: "log",
          description: "Lit le dernier fichier de log ou le nième dernier log",
          options: [
            {
              name: "n",
              type: 4,
              description: "Indice du log depuis le plus récent (1 = dernier)",
              required: false,
              min_value: 1,
            },
          ],
        },
        {
          name: "trap",
          description: "Pose une question a l'utilisateur sur le sujet de sa connaissance"
        }
      ];

      await client.application.commands.set(commands);
      console.log("Commandes slash (/maj, /help, /trust, /chat, /export, /log) enregistrées !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement des commandes:", error);
    }
  });
}
