import ScheduleParser from "./parser.js";
import qrcode from "qrcode-terminal";
import whatsapp from "whatsapp-web.js";
import dotenv from "dotenv";
dotenv.config();

const { Client, LocalAuth } = whatsapp;

const client = new Client({
   authStrategy: new LocalAuth({
      dataPath: "./",
   }),
});

const parser = new ScheduleParser();

async function checkForChanges() {
   console.log("Checking for changes...");

   const tomorrow = new Date();
   tomorrow.setDate(tomorrow.getDate() + 1);
   const day = tomorrow.getDate().toString().slice(-2);

   const oldEntries = parser.entries;
   await parser.run({ Klasse: "ZM 24", Datum: day });

   const newEntries = parser.entries;
   const changedEntries = newEntries.filter(
      (newEntry) =>
         !oldEntries?.some(
            (oldEntry) => JSON.stringify(oldEntry) === JSON.stringify(newEntry)
         )
   );

   if (changedEntries.length > 0) {
      const message = changedEntries
         .map(
            (entry) =>
               `> ${Object.keys(entry)
                  .sort(
                     (a, b) =>
                        parser.columns.indexOf(a) - parser.columns.indexOf(b)
                  )
                  .map((key) => {
                     let str = entry[key];

                     switch (key) {
                        case "Raum":
                           str = key + " " + str;
                           break;
                        case "Dstd.":
                           str += " " + key;
                           break;
                     }

                     return str;
                  })
                  .join(" | ")}`
         )
         .join("\n\n");
      console.log("Changes detected!");
      await client.sendMessage(
         process.env.WHATSAPP_CHAT_ID,
         "Vertretungsplan für morgen hat sich geändert!\n\n" + message
      );
   }
}

client.once("ready", async () => {
   console.log("Client is ready!");
   checkForChanges();
   setInterval(checkForChanges, 1000 * 60 * 60); // every hour
});

client.on("qr", (qr) => {
   qrcode.generate(qr, { small: true });
});

console.log("Initializing client...");
client.initialize();
