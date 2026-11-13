'use strict';
/* Built-in note templates + helpers to build their HTML */
const Tpl = {
  task(text, due) {
    return '<div class="task" data-id="' + uid() + '" data-done="0" data-due="' + (due || '') + '"><span class="tbox" contenteditable="false"></span><span class="ttext">' + (text ? esc(text) : '<br>') + '</span><span class="tdue" contenteditable="false"></span></div>';
  },
  cornellRow(cue, note) { return '<div class="crow"><div class="cue">' + (cue ? esc(cue) : '<br>') + '</div><div class="cnote">' + (note ? esc(note) : '<br>') + '</div></div>'; },
  cornell(rows = 3) { let h = '<div class="cornell"><div class="chead" contenteditable="false"><span>CUES</span><span>NOTES</span></div>'; for (let i = 0; i < rows; i++) h += this.cornellRow(); return h + '</div>'; },
  table(r = 3, c = 3) { let h = '<table><tbody>'; for (let i = 0; i < r; i++) { h += '<tr>'; for (let j = 0; j < c; j++) h += '<td><br></td>'; h += '</tr>'; } return h + '</tbody></table><p><br></p>'; },
  builtIns() {
    const today = fmtDate(now(), true);
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return [
      { id: 'free', name: 'Free note', desc: 'A blank page', builtIn: true, title: '', html: '' },
      { id: 'meeting', name: 'Meeting notes', desc: 'Attendees, decisions, action items', builtIn: true, title: 'Meeting — ' + today,
        html: '<h3>Attendees</h3><p><br></p><h3>Agenda</h3><ul><li><br></li></ul><h3>Decisions</h3><ul><li><br></li></ul><h3>Action items</h3>' + this.task() + '<p><br></p>' },
      { id: 'cornell', name: 'Cornell', desc: 'Cues, notes and summary — great for flashcards', builtIn: true, title: '',
        html: '<p><br></p>' + this.cornell(3) + '<h3>Summary</h3><p><br></p>' },
      { id: 'project', name: 'Project outline', desc: 'Goal, milestones, tasks, risks', builtIn: true, title: '',
        html: '<h3>Goal</h3><p><br></p><h3>Scope</h3><ul><li><br></li></ul><h3>Milestones</h3><ol><li><br></li></ol><h3>Tasks</h3>' + this.task() + '<h3>Risks</h3><ul><li><br></li></ul><h3>Notes</h3><p><br></p>' },
      { id: 'checklist', name: 'Checklist', desc: 'A list of tasks with due dates', builtIn: true, title: '',
        html: this.task() + this.task() + this.task() + '<p><br></p>' },
      { id: 'lecture', name: 'Lecture notes', desc: 'Topic, key points, definitions, questions', builtIn: true, title: '',
        html: '<p><b>Course:</b> <br></p><p><b>Date:</b> ' + esc(today) + '</p><p><b>Topic:</b> <br></p><h3>Key points</h3><ul><li><br></li></ul><h3>Definitions</h3><div class="callout"><b>Term</b> — <br></div><h3>Questions</h3><ul><li><br></li></ul><h3>Summary</h3><p><br></p>' },
      { id: 'weekly', name: 'Weekly plan', desc: 'Top priorities and a list for each day', builtIn: true, title: 'Week of ' + today,
        html: '<h3>Top 3 priorities</h3>' + this.task() + this.task() + this.task() + days.map((d) => '<h3>' + d + '</h3>' + this.task()).join('') + '<h3>Notes</h3><p><br></p>' }
    ];
  },
  all() { return this.builtIns().concat(Store.all('templates').filter((t) => !t.deletedAt).sort((a, b) => a.name.localeCompare(b.name))); },
  find(id) { return this.all().find((t) => t.id === id); },
  /* Fresh copy of a template's HTML: new task ids, tasks unticked */
  instantiate(html) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    d.querySelectorAll('.task').forEach((t) => { t.dataset.id = uid(); t.dataset.done = '0'; });
    return d.innerHTML;
  }
};
