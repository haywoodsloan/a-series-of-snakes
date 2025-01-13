<template>
  <div class="selector">
    <table class="grid">
      <!-- TODO: Build grid from actual data -->
      <tr v-for="n in 4">
        <td v-for="n in 5">
          <button class="preview"></button>
        </td>
      </tr>
    </table>
    <div class="controls">
      <button class="prev" aria-label="Previous">
        <!-- TODO: get icon -->
        Prev
      </button>
      <button class="next" aria-label="Next">
        <!-- TODO: get icon -->
        Next
      </button>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['select']);
</script>

<style lang="scss" scoped>
.selector {
  display: flex;
  overflow: hidden;
  
  flex-direction: column;
  justify-content: center;

  width: 70%;
  margin: 0 auto;
}

.grid {
  margin: 2rem 0;
  border-collapse: separate;
  border-spacing: 1vw;

  td {
    text-align: center;
    vertical-align: middle;
  }
}

.controls {
  display: flex;
  justify-content: center;
  gap: 2rem;
}

.preview {
  aspect-ratio: 16/10;
  width: 100%;

  border: solid 0.1rem white;
  border-radius: 15% 15%;
}
</style>
