<script setup>
import { onMounted, watch } from 'vue';
import AppFooter from './components/AppFooter.vue';
import AppTooltip from './components/AppTooltip.vue';
import CheapWindowPanel from './components/CheapWindowPanel.vue';
import ControlRail from './components/ControlRail.vue';
import DistributionPanel from './components/DistributionPanel.vue';
import HeatmapPanel from './components/HeatmapPanel.vue';
import KpiStrip from './components/KpiStrip.vue';
import MastHead from './components/MastHead.vue';
import ProfilePanel from './components/ProfilePanel.vue';
import SpreadPanel from './components/SpreadPanel.vue';
import TimelinePanel from './components/TimelinePanel.vue';
import { useControls } from './composables/useControls.js';
import { usePriceData } from './composables/usePriceData.js';
import { useSelection } from './composables/useSelection.js';
import { isoAddDays } from './lib/analysis.js';

const { granularity, dateRange } = useControls();
const { ensureLoaded } = usePriceData();
const { extent } = useSelection();

onMounted(() => ensureLoaded(granularity.value));
watch(granularity, (g) => ensureLoaded(g));

// default to the last 90 days once data first lands, unless the user already picked
let defaulted = false;
watch(extent, (e) => {
  if (defaulted || !e) return;
  defaulted = true;
  if (dateRange.value.from == null && dateRange.value.to == null) {
    const from = isoAddDays(e.to, -89);
    dateRange.value = { from: from > e.from ? from : null, to: null };
  }
});
</script>

<template>
  <MastHead />
  <div class="frame">
    <ControlRail />
    <main class="main">
      <KpiStrip />
      <TimelinePanel />
      <HeatmapPanel />
      <div class="duo">
        <ProfilePanel />
        <DistributionPanel />
      </div>
      <div class="duo">
        <SpreadPanel />
        <CheapWindowPanel />
      </div>
      <AppFooter />
    </main>
  </div>
  <AppTooltip />
</template>

<style scoped>
.frame {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  max-width: 1680px;
  margin: 0 auto;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.duo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1080px) {
  .frame {
    grid-template-columns: 1fr;
  }

  .duo {
    grid-template-columns: 1fr;
  }
}
</style>
