import { Results } from "@/components/Results";
import { getRealTechs } from "@/lib/listings";
import { SearchBar } from "@/components/SearchBar";

export default async function Home() {
  const realTechs = await getRealTechs();
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">
            <span className="tally" />
            B2B rentals &amp; crew for live events · worldwide
          </div>
          <h1>
            Short on gear or crew? <span>Someone nearby has it.</span>
          </h1>
          <p className="lede">
            Rental houses list live inventory straight from Rentman or Flex. Techs and engineers list their skills.
            Search once, see who has it near your show and free on your dates.
          </p>
          <SearchBar />
        </div>
      </section>

      <div className="demo">
        <div className="wrap">
          <b>Sample data</b>
          <span>Companies, crew and availability are examples until real accounts and the Rentman/Flex sync are connected.</span>
        </div>
      </div>

      <section className="main">
        <div className="wrap">
          <Results realTechs={realTechs} />
        </div>
      </section>
    </main>
  );
}
