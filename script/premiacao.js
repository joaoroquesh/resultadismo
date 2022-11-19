$( document ).ready(function() {

    const url ='https://script.googleusercontent.com/macros/echo?user_content_key=tl7SloRR7qM-CuJrUl4ERzHad1xhHTm_xUgGwyzaHionfKiceVoV3L7XUAVWCCOoyFbAI26e2iViuBey7uxFh4GL-D81_mtNm5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnGzGt-e5YnOBLWYqIhpz_hn4O9Hsqf5sSN4bOjULLBbdnjZp2AS8JQ11BwLOFQOotJkUG905ZtFTVclqgwPfQr0dth0pfgjm9dz9Jw9Md8uu&lib=MOZSO5j8T0Tt85KkGr-qySvlUalP-BxzV';

     var model = "<p class='m-0'>No momento temos <b>{inscritos} inscritos</b>.<br>Assim ficam os valores das premiações:</p>"+
                "<ul><li><b>1° lugar | R${first}</b></li>"+
                "<li>2° lugar | R${second}</li>"+
                "<li>3° lugar | R${third}</li>"+
                "<li>4° lugar | R${fourth}</li><ul>";
              
 

    $(".list-results-content").empty();  


        fetch(url).then(rep => rep.json())
            .then((data) => {
                data.data.forEach((el) => {
                  
                   line = model;
                   line = line.replace("{inscritos}", el.inscritos);
                   line = line.replace("{first}", el.first);
                   line = line.replace("{second}", el.second);
                   line = line.replace("{third}", el.third);
                   line = line.replace("{fourth}", el.fourth);
                   $(".infos-dados").append(line);

                    
                })
            })
            


});  