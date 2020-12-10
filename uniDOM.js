let uni;
(() => {
    const IGNORE_INTERPRET = ["SCRIPT", "LINK", "HTML", "HEAD", "LINK", "IFRAME", "TITLE"];
    const parser = new DOMParser();

    //exports
    uni = {
        addComponent,
        _ignore_interpret: IGNORE_INTERPRET,
        _preClosure: preClosure,
        _evalExecTree: evalExecTree
    };

    // loads a component as a child of parent
    function addComponent(name, parent, props){
        const component = uni._rawComponents[name];
        let componentHTML = component && parser.parseFromString(component.srcBuffer, "text/html");
        let componentExec = component && component.execTree;
        if (!component) return;
        componentHTML = componentHTML.getElementsByTagName("template")[0].innerHTML;
        // keep track of the initial num of childs
        const numChildOld = parent.children.length;
        const mockComponent = document.createElement('DIV');
        mockComponent.innerHTML = componentHTML;
        for (let j = 0; j < mockComponent.children.length; j++) {
            parent.appendChild(mockComponent.children[j].cloneNode(true));
        }
        // component is appended
        // components can have multiple roots so they all need to be evaluated
        // numChildOld is the index of the appended component 1st root so iteration starts there
        const children = parent.children;
        for (let i = numChildOld; i < numChildOld + componentExec.children.length; i++) {
            if (!children[i]._didInit) {
                //componentExec.children[i - numChildOld].context = children[i];
                uni._evalExecTree(componentExec.children[i - numChildOld], children[i], props);
            }
            else break;
        }
    }

    // get props from html tag attributes
    function getProps(target) {
        const props = {};
        const nameList = target.getAttributeNames();
        for (let i = 0; i < nameList.length; i++) {
            let name = nameList[i];
            props[name] = target.getAttribute(name);
        }
        return props;
    }

    // search children of target for component tags then load if exists
    function registerComponent(target, name) {
        const component = uni._rawComponents[name.toLowerCase()];
        const componentHTML = component && parser.parseFromString(component.srcBuffer, "text/html");;
        const componentExec = component && component.execTree;
        if (!component) return;

        for (let i = 0; i < target.children.length; i++) {
            const el = target.children[i];
            if (el.tagName == name.toUpperCase()) {
                let props = getProps(el);
                el.outerHTML = componentHTML.getElementsByTagName("template")[0].innerHTML;
                
                for (let j = i; j < i + componentExec.children.length; j++){
                    evalExecTree(componentExec.children[j - i], target.children[j], props);
                }
                i += el.children.length;
            }
        }
    }

    // ran before every closure to bind core properties to a target
    function preClosure(){
        this.addComponent = (name, props = {}) => uni.addComponent(name, this, props);
        this._stateChangeListens = [];
        this.find = this.querySelector;

        this.bindState = function (cb){
            // attach this callback to the nearest ancestor with a declared state
            if (this.state){
                this._stateChangeListens.push(cb);
                cb(this.state);
            }
            else if (this != document.body){
                this.parentElement.bindState(cb);
            }
        };
        this.setState = function (newState) {
            let updated = false;
            // call on the nearest ancestor with a declared state
            if (!this.state) {
                if (this != document.body && this.parentElement) {
                    this.parentElement.setState(newState);
                }
                return;
            }
    
            for (let key in newState) {
                if (!newState.hasOwnProperty(key)) {
                    return;
                }
                let val = newState[key];
                if (this.state[key] !== undefined) { 
                    // if state has a matching attribute with newState
                    if (!updated) {
                        this._stateChangeListens.forEach(f => {
                            f(newState);
                        });
                        updated = true;
                    }
                    this.state[key] = val;
                    delete newState[key]; // delete the matching attribute from newState
                }
            }
            //if newState still has attributes then it could mean that they are meant for higher ancestors as well
            //we make sure by recursing on the ancestors until we used up all attributes or reached the root
            if (Object.keys(newState).length && this != document.body) {
                this.parentElement.setState(newState);
            }
        };
    }

    function runClosure(closure, context){
        //console.log(closure, context)
        const raw = `
        uni._preClosure.call(this);
        `+closure+` 
        return {
            onFullLoad: typeof this.onFullLoad === 'function' ? this.onFullLoad : null,
            onChildLoad: typeof this.onChildLoad === 'function' ? this.onChildLoad : null,
            imports: typeof this.imports === 'object' ? this.imports : null
        }`
        const _cl = Function(raw).call(context);
        if (_cl.imports) {
            const imports = _cl.imports;
            for (let i = 0; i < imports.length; i++) {
                registerComponent(context, imports[i]);
            }
        }
        return _cl
    }

    function evalExecTree(tree, context, props = {}){
        const children = tree.children;
        //console.log(tree, context);
        context.props = props;
        runClosure(tree.closure, context);
        context._didInit = true;
        for (let i = 0; i < children.length; i++){
            const child = context.childNodes.length > children[i].context 
                        && context.childNodes[children[i].context];
            if (!child || child._didInit) continue;
            evalExecTree(children[i], child, props);
            if (context.onChildLoad){
                context.onChildLoad(child);
            }
        }
        if (context.onFullLoad){
            context.onFullLoad();
        }
        return context;
    }
})()
console.log("uni loaded");