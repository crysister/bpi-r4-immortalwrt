'use strict';
'require baseclass';

return baseclass.extend({
    content: function(container, nodes) {
        if (!container)
            return;

        while (container.firstChild)
            container.removeChild(container.firstChild);

        if (nodes == null || nodes === '')
            return;

        if (Array.isArray(nodes)) {
            for (var i = 0; i < nodes.length; i++)
                if (nodes[i] != null && nodes[i] !== '')
                    container.appendChild(nodes[i]);
        } else if (typeof nodes === 'string') {
            container.textContent = nodes;
        } else if (nodes != null && nodes !== '') {
            container.appendChild(nodes);
        }
    }
});
