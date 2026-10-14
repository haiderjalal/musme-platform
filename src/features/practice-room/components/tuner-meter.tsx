import type { ReactElement } from "react";

import { getMeterScale, METER_BAR_SHAPE } from "../engine/tuning";

interface TunerMeterProps {
  readonly level: number;
}

/** Input level shown as bars. It is scaled with transform only, so it never triggers layout. */
export function TunerMeter({ level }: TunerMeterProps): ReactElement {
  return (
    <div aria-hidden="true" className="flex h-10 items-end justify-center gap-1">
      {METER_BAR_SHAPE.map((shape, index) => (
        <span
          key={index}
          className="block h-full w-1.5 origin-bottom rounded-full bg-room-ok transition-transform duration-75 motion-reduce:transition-none"
          style={{ transform: `scaleY(${getMeterScale(level, shape)})` }}
        />
      ))}
    </div>
  );
}
