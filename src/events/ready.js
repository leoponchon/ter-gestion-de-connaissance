export default function readyHandler(client) {
  client.once("ready", async () => {
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
        }
      ];

      await client.application.commands.set(commands);
      console.log("Commandes slash (/maj, /help) enregistrées !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement des commandes:", error);
    }
  });
}
