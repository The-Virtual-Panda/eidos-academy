// Academy's app entry, which only the Eidos MD app mounts: the routes its page half calls,
// under /api/plugins/academy/. Every rule is in the API the commands share.
import { HostError, type AppEntry, type PluginRequest } from 'eidosmd/plugin';
import type { Api } from './api.ts';
import type { AttemptKind, AttemptMode, Card, Question, StudyMode } from './model.ts';

function need(request: PluginRequest, name: string): string {
  const value = request.query.get(name) ?? (typeof request.body[name] === 'string' ? (request.body[name] as string) : null);
  if (!value) throw new HostError(400, `${name} is needed`);
  return value;
}

const entry: AppEntry<Api> = {
  name: 'academy',
  mount(host, api) {
    host.route('GET', 'overview', () => api.overview());
    host.route('GET', 'pickable', () => api.pickable());

    host.route('GET', 'quiz', (request) => api.quiz(need(request, 'id')));
    host.route('POST', 'quiz', (request) => api.createQuiz(request.body as { title: string; draws_from?: string[]; course?: string | null; place?: number | null }));
    host.route('PUT', 'quiz', (request) => api.updateQuiz(need(request, 'id'), request.body as Parameters<Api['updateQuiz']>[1]));
    host.route('DELETE', 'quiz', (request) => api.removeQuiz(need(request, 'id')));

    host.route('GET', 'source', (request) => api.quizSource(need(request, 'id')));
    host.route('PUT', 'source', (request) => api.saveQuizSource(need(request, 'id'), request.body['text'] as string));

    host.route('PUT', 'question', (request) => api.saveQuestion(need(request, 'id'), request.body['question'] as Question));
    host.route('POST', 'question/blank', (request) => api.store.blankQuestion(api.store.quiz(need(request, 'id'))));
    host.route('DELETE', 'question', (request) => api.removeQuestion(need(request, 'id'), need(request, 'question')));
    host.route('PUT', 'questions/order', (request) => api.orderQuestions(need(request, 'id'), request.body['ids'] as string[]));

    host.route('GET', 'compare', (request) => api.compare(need(request, 'id')));
    host.route('GET', 'results', (request) => api.results(need(request, 'id')));
    host.route('GET', 'attempt', (request) => api.attempt(need(request, 'id'), need(request, 'attempt')));
    host.route('POST', 'attempt', (request) => api.submit(request.body as { quiz: string; kind: AttemptKind; mode: AttemptMode; answers: Array<{ question: string; chosen: number }> }));

    host.route('GET', 'course', (request) => api.course(need(request, 'id')));
    host.route('POST', 'course', (request) => api.createCourse(request.body as { title: string; description?: string }));
    host.route('PUT', 'course', (request) => api.updateCourse(need(request, 'id'), request.body as Parameters<Api['updateCourse']>[1]));
    host.route('DELETE', 'course', (request) => api.removeCourse(need(request, 'id')));
    host.route('PUT', 'course/order', (request) => api.reorderCourse(need(request, 'id'), request.body['ids'] as string[]));
    host.route('POST', 'course/enroll', (request) => api.enroll(need(request, 'id')));
    host.route('DELETE', 'course/enroll', (request) => api.leave(need(request, 'id')));
    host.route('GET', 'course/progress', (request) => api.courseProgress(need(request, 'id'), request.query.get('person')));
    host.route('GET', 'course/people', (request) => api.courseRoster(need(request, 'id')));

    host.route('GET', 'deck', (request) => api.deck(need(request, 'id')));
    host.route('POST', 'deck', (request) => api.createDeck(request.body as Parameters<Api['createDeck']>[0]));
    host.route('PUT', 'deck', (request) => api.updateDeck(need(request, 'id'), request.body as Parameters<Api['updateDeck']>[1]));
    host.route('DELETE', 'deck', (request) => api.removeDeck(need(request, 'id')));
    host.route('GET', 'deck/source', (request) => api.deckSource(need(request, 'id')));
    host.route('PUT', 'deck/source', (request) => api.saveDeckSource(need(request, 'id'), request.body['text'] as string));
    host.route('PUT', 'card', (request) => api.saveCard(need(request, 'id'), request.body['card'] as Card));
    host.route('POST', 'card/blank', (request) => api.store.blankCard(api.store.deck(need(request, 'id'))));
    host.route('DELETE', 'card', (request) => api.removeCard(need(request, 'id'), need(request, 'card')));
    host.route('PUT', 'cards/order', (request) => api.orderCards(need(request, 'id'), request.body['ids'] as string[]));
    host.route('POST', 'cards/from-quiz', (request) => api.cardsFromQuiz(need(request, 'id'), need(request, 'quiz')));

    host.route('GET', 'study', (request) => api.study({ deck: request.query.get('deck'), course: request.query.get('course'), mode: request.query.get('mode') as StudyMode | null }));
    host.route('POST', 'study', (request) => api.saveStudy(request.body as Parameters<Api['saveStudy']>[0]));
    host.route('GET', 'keep-studying', () => api.keepStudying());

    host.route('POST', 'move-quizzes', () => api.moveFromQuizzes());

    host.route('GET', 'blueprint', (request) => api.forBlueprint(need(request, 'id')));
    host.route('PUT', 'session', async (request) => {
      await api.setSessionDone(need(request, 'blueprint'), request.body['done'] === true);
      return { ok: true };
    });
  },
};

export default entry;
