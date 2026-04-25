export default function readyHandler(client) {
  client.once("ready", async () => {
    console.log(`${client.user.tag} prêt à discuter !`);
    client.user.setActivity("Discute avec les utilisateurs !");
    
    try {
      await client.application.commands.create({
        name: "maj",
        description: "Indique la date de la dernière mise à jour du bot"
      });
      console.log("Commande /maj enregistrée !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la commande:", error);
    }
  });
}
