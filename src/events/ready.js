export default function readyHandler(client) {
  client.once("clientReady", () => {
    console.log(`${client.user.tag} prêt à discuter !`);
    client.user.setActivity("Discute avec les utilisateurs !");
  });
}
