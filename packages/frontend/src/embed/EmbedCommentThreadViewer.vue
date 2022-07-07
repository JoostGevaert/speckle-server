<template>
  <div
    class="no-mouse py-2"
    :style="`max-width: 350px; padding-right:30px; transition: opacity 0.2s ease; padding-left: 6px;`"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div style="width: 100%" class="mouse d-block">
      <template v-for="(reply, index) in thread">
        <div
          v-if="showTime(index)"
          :key="index + 'date'"
          class="d-flex justify-center mouse"
        >
          <div
            class="d-inline px-2 py-0 caption text-center mb-2 rounded-lg background grey--text"
          >
            {{ new Date(reply.createdAt).toLocaleString() }}
            <timeago :datetime="reply.createdAt" class="font-italic ma-1"></timeago>
          </div>
        </div>
        <comment-thread-reply :key="index + 'reply'" :reply="reply" :index="index" />
      </template>
    </div>
  </div>
</template>
<script>
import { getReplies } from '@/embed/speckleUtils'
import CommentThreadReply from '@/embed/EmbedCommentThreadReply.vue'

export default {
  name: 'CommentThreadViewer',
  components: { CommentThreadReply },
  props: {
    comment: {
      type: Object,
      default: () => null
    }
  },
  data() {
    return {
      thread: []
    }
  },
  async mounted() {
    const response = await getReplies(this.$route.query.stream, this.comment.id)
    this.thread = [...response.data.comment.replies.items]
  },
  methods: {
    showTime(index) {
      if (index === 0) return true
      const curr = new Date(this.thread[index].createdAt)
      const prev = new Date(this.thread[index - 1].createdAt)
      const delta = Math.abs(prev - curr)
      return delta > 450000
    }
  }
}
</script>
