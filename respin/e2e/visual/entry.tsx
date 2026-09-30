import { hydrateRoot } from "react-dom/client";
import { Fixture, type FixtureProps } from "./fixtures";
import "../../app/respin-tokens.css";
import "../../app/globals.css";

const props = JSON.parse(document.getElementById("fixture-props")!.textContent!) as FixtureProps;
hydrateRoot(document.getElementById("fixture")!, <Fixture {...props} />);
