import PDFParser from "pdf2json";
import fs from "fs";

class ScheduleParser {
   constructor() {
      this.columns = [
         "Tag",
         "Datum",
         "Klasse",
         "Dstd.",
         "Fach",
         "Lehrer",
         "Raum",
         "Bemerkungen",
      ];

      this.teacherAbbreviations = {
         BE: "Herr Bender",
         AN: "Frau Antonowa",
         KI: "Herr Kist",
         SEI: "Herr Seidemann",
         HOF: "Herr Hofmann",
         GOW: "Herr Gottwald",
         LET: "Herr Lehnert",
         SAR: "Herr Sarunsky",
         MOT: "Herr Mothes",
         WEI: "Herr Weiche",
      };

      this.weekdayAbbreviations = {
         mo: "Montag",
         di: "Dienstag",
         mi: "Mittwoch",
         do: "Donnerstag",
         fr: "Freitag",
      };
   }

   async loadPdfBuffer() {
      if (true) {
         const url = "https://karl-heine-schule-leipzig.de/";
         const response = await fetch(url + "?Termine_und_Unterrichtszeiten", {
            cache: "force-cache",
         });

         const html = await response.text();
         const startIndex = html.indexOf(
            "userfiles/downloads/Vertretungsplan/Pansastrasse" // this is dum :D
         );
         if (startIndex === -1) throw new Error("Link not found");

         const endIndex = html.indexOf('"', startIndex);
         const link = html.substring(startIndex, endIndex);

         const pdfResponse = await fetch(url + link);
         const pdfArrayBuffer = await pdfResponse.arrayBuffer();
         return Buffer.from(pdfArrayBuffer);
      } else {
         return fs.readFileSync("27.01.2025_web.pdf");
      }
   }

   determineColumnPositions(fills) {
      const sortedFills = fills
         .filter((fill) => fill.w === 0.06)
         .sort((a, b) => a.x - b.x);

      const columnPositions = {};
      let index = 0;
      sortedFills.forEach((fill) => {
         if (!columnPositions[fill.x]) {
            columnPositions[fill.x] = this.columns[index];
            index++;
         }
      });

      return this.calculateColumnWidths(columnPositions);
   }

   calculateColumnWidths(columnPositions) {
      const widths = {};
      Object.keys(columnPositions).forEach((x) => {
         const nextX = Object.keys(columnPositions).find(
            (next) => Number(next) > Number(x)
         );
         widths[x] = nextX ? Number(nextX) - Number(x) : 0;
      });
      return { positions: columnPositions, widths };
   }

   filterTexts(texts) {
      return texts.filter((text) => {
         const value = decodeURIComponent(text.R[0].T).toLowerCase();
         return !value.includes("stand") && !value.includes("woche");
      });
   }

   processPage(page) {
      const { positions: columnPositions, widths } =
         this.determineColumnPositions(page.Fills);
      const filteredTexts = this.filterTexts(page.Texts);

      let entries = [];
      let currentEntry = {};
      let lastDay = "";
      let lastDate = "";
      let lastClass = "";
      let dateState = true;
      let currentY = 0;

      const pushEntry = () => {
         if (Object.keys(currentEntry).length === 0) return;

         // Fill in missing values
         currentEntry.Datum = currentEntry.Datum || lastDate;
         currentEntry.Tag = currentEntry.Tag || lastDay;
         currentEntry.Klasse = currentEntry.Klasse || lastClass;

         // Replace teacher abbreviations
         if (this.teacherAbbreviations[currentEntry.Lehrer]) {
            currentEntry.Lehrer =
               this.teacherAbbreviations[currentEntry.Lehrer];
         }

         // Replace weekday abbreviations
         const lowerTag = currentEntry.Tag.toLowerCase();
         currentEntry.Tag =
            this.weekdayAbbreviations[
               Object.keys(this.weekdayAbbreviations).find((key) =>
                  lowerTag.startsWith(key)
               )
            ] || currentEntry.Tag;

         dateState = true;
         entries.push(currentEntry);
         currentEntry = {};
      };

      filteredTexts.forEach((text) => {
         const value = decodeURIComponent(text.R[0].T);
         const posX = text.x + text.sw;

         // New row, push current entry
         if (currentY < text.y) {
            currentY = text.y;
            pushEntry();
         }

         // Find the column containing this text
         const xPosition = Object.keys(columnPositions).find(
            (x) => Number(x) <= posX && Number(x) + widths[x] >= posX
         );

         if (xPosition) {
            const column =
               columnPositions[
                  Object.keys(columnPositions)[
                     Object.keys(columnPositions).indexOf(xPosition) + 1
                  ]
               ];

            switch (column) {
               case "Datum":
                  dateState = !dateState;
                  if (dateState) {
                     lastDate = value;
                  } else {
                     lastDay = value;
                  }
                  break;
               case "Klasse":
                  lastClass = value;
                  break;
               default:
                  currentEntry[column] = value;
            }
         }
      });

      pushEntry();
      return entries;
   }

   parseSchedule(pdfBuffer, filter = {}) {
      return new Promise((resolve, reject) => {
         const pdfParser = new PDFParser();

         pdfParser.on("pdfParser_dataError", (errData) => {
            reject(errData.parserError);
         });

         pdfParser.on("pdfParser_dataReady", (pdfData) => {
            let entries = pdfData.Pages.flatMap((page) =>
               this.processPage(page)
            );

            entries.splice(0, 1);

            // Filter for specific class
            Object.entries(filter).forEach(([key, value]) => {
               const regex = new RegExp(value, "i");
               entries = entries.filter((entry) => regex.test(entry[key]));
            });

            this.entries = entries;
            resolve(entries);
         });

         pdfParser.parseBuffer(pdfBuffer);
      });
   }

   printSchedule(entries = this.entries) {
      // Optional: Format entries for console output
      entries.forEach((entry) => {
         let str = this.columns
            .filter((col) => entry[col])
            .map((col) => entry[col])
            .join(" | ");
         console.log(str);
      });
   }

   async run(filter) {
      try {
         const pdfBuffer = await this.loadPdfBuffer();
         return await this.parseSchedule(pdfBuffer, filter);
      } catch (error) {
         new Error("Error parsing schedule:", error);
      }
   }
}

export default ScheduleParser;
